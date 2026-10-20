package reading

import (
	"archive/zip"
	"bytes"
	"context"
	"encoding/xml"
	"fmt"
	"io"
	"os"
	"path"
	"path/filepath"
	"regexp"
	"sort"
	"strconv"
	"strings"
	"sync"

	"golang.org/x/sync/singleflight"
	"unicode/utf8"

	"golang.org/x/net/html"
	"golang.org/x/text/encoding/simplifiedchinese"
	textunicode "golang.org/x/text/encoding/unicode"
)

type Chapter struct {
	Title string `json:"title"`
}
type Book struct {
	Format   string    `json:"format"`
	Count    int       `json:"count"`
	Chapters []Chapter `json:"chapters"`
	images   []string
	contents [][]string
	cover    string
}
type cachedBook struct {
	signature string
	book      *Book
	size      int64
	used      uint64
}
type Reader struct {
	mu         sync.Mutex
	cache      map[string]cachedBook
	bytes      int64
	clock      uint64
	flights    singleflight.Group
	init       sync.Once
	slots      chan struct{}
	imageSlots chan struct{}
}

func (r *Reader) initialize() {
	r.init.Do(func() { r.slots = make(chan struct{}, 2); r.imageSlots = make(chan struct{}, 4) })
}

func openSource(root, name string) (*os.File, error) {
	if filepath.IsAbs(name) || !filepath.IsLocal(filepath.FromSlash(name)) {
		return nil, fmt.Errorf("书库路径无效")
	}
	directory, err := os.OpenRoot(root)
	if err != nil {
		return nil, fmt.Errorf("书库目录不可读，请检查挂载")
	}
	defer directory.Close()
	file, err := directory.Open(filepath.FromSlash(name))
	if err != nil {
		return nil, fmt.Errorf("源文件不可读，请刷新书库后重试")
	}
	info, err := file.Stat()
	if err != nil || !info.Mode().IsRegular() {
		file.Close()
		return nil, fmt.Errorf("源文件不是普通文件")
	}
	return file, nil
}
func (r *Reader) Book(root, name, format string) (*Book, error) {
	file, err := openSource(root, name)
	if err != nil {
		return nil, err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, err
	}
	key := root + "\x00" + name
	signature := fmt.Sprintf("%d:%d", stat.Size(), stat.ModTime().UnixNano())
	if cached := r.cached(key, signature); cached != nil {
		return cached, nil
	}
	r.initialize()
	value, err, _ := r.flights.Do(key+"\x00"+signature, func() (any, error) {
		if cached := r.cached(key, signature); cached != nil {
			return cached, nil
		}
		r.slots <- struct{}{}
		defer func() { <-r.slots }()
		book, err := parseBook(file, stat.Size(), format)
		if err == nil {
			r.remember(key, signature, book)
		}
		return book, err
	})
	if err != nil {
		return nil, err
	}
	return value.(*Book), nil
}

func parseBook(file *os.File, size int64, format string) (*Book, error) {
	book := &Book{Format: format, Chapters: []Chapter{}}
	switch format {
	case "CBZ":
		archive, err := zip.NewReader(file, size)
		if err != nil {
			return nil, fmt.Errorf("CBZ 压缩包损坏或格式无效")
		}
		for _, entry := range archive.File {
			if !entry.FileInfo().IsDir() && imageType(entry.Name) != "" && !strings.HasPrefix(entry.Name, "__MACOSX/") {
				book.images = append(book.images, entry.Name)
			}
		}
		if len(book.images) == 0 || len(book.images) > 10000 {
			return nil, fmt.Errorf("漫画没有可读图片或页数超过限制")
		}
		sort.SliceStable(book.images, func(i, j int) bool { return naturalLess(book.images[i], book.images[j]) })
		book.Count = len(book.images)
	case "TXT":
		if size > 64<<20 {
			return nil, fmt.Errorf("TXT 超过 64 MB，暂不支持在线打开")
		}
		data, err := io.ReadAll(io.LimitReader(file, 64<<20+1))
		if err != nil {
			return nil, err
		}
		text, err := decodeText(data)
		if err != nil {
			return nil, err
		}
		splitText(book, text)
	case "EPUB":
		archive, err := zip.NewReader(file, size)
		if err != nil {
			return nil, fmt.Errorf("EPUB 文件无效")
		}
		if err = readEPUB(book, archive); err != nil {
			return nil, err
		}
	default:
		return nil, fmt.Errorf("该格式暂不支持在线阅读，请使用 CBZ、TXT 或 EPUB")
	}
	return book, nil
}
func decodeText(data []byte) (string, error) {
	var result []byte
	var err error
	if bytes.HasPrefix(data, []byte{0xff, 0xfe}) || bytes.HasPrefix(data, []byte{0xfe, 0xff}) {
		result, err = textunicode.UTF16(textunicode.LittleEndian, textunicode.UseBOM).NewDecoder().Bytes(data)
	} else if utf8.Valid(data) {
		result = data
	} else {
		result, err = simplifiedchinese.GB18030.NewDecoder().Bytes(data)
	}
	if err != nil {
		return "", fmt.Errorf("小说文本编码无法识别")
	}
	return strings.TrimPrefix(strings.ReplaceAll(string(result), "\r\n", "\n"), "\ufeff"), nil
}

var chapterHeading = regexp.MustCompile(`^(第[零〇一二三四五六七八九十百千万两0-9]+[章节卷回部篇].*|序章.*|楔子.*|尾声.*|后记.*|番外.*|Chapter\s+[0-9]+.*)$`)

func splitText(book *Book, text string) {
	title := "开篇"
	lines := []string{}
	size := 0
	flush := func() {
		if len(lines) > 0 {
			// A substring title must not retain the entire decoded novel buffer.
			book.Chapters = append(book.Chapters, Chapter{strings.Clone(title)})
			book.contents = append(book.contents, lines)
			lines = []string{}
			size = 0
		}
	}
	for _, line := range strings.Split(text, "\n") {
		line = strings.TrimSpace(line)
		if line == "" {
			continue
		}
		if utf8.RuneCountInString(line) <= 80 && chapterHeading.MatchString(line) {
			flush()
			title = line
			continue
		}
		if size > 12000 {
			flush()
			title = "续读 · " + strconv.Itoa(len(book.Chapters)+1)
		}
		// Bound paragraphs even when a TXT contains an entire book on one line.
		runes := []rune(line)
		for len(runes) > 4000 {
			lines = append(lines, string(runes[:4000]))
			size += 4000
			runes = runes[4000:]
			if size > 12000 {
				flush()
				title = "续读 · " + strconv.Itoa(len(book.Chapters)+1)
			}
		}
		if len(runes) > 0 {
			lines = append(lines, string(runes))
			size += len(runes)
		}
	}
	flush()
	book.Count = len(book.Chapters)
	if book.Count == 0 {
		book.Chapters = []Chapter{{"正文"}}
		book.contents = [][]string{{"（该文件没有可读正文）"}}
		book.Count = 1
	}
}
func imageType(name string) string {
	switch strings.ToLower(path.Ext(name)) {
	case ".jpg", ".jpeg":
		return "image/jpeg"
	case ".png":
		return "image/png"
	case ".webp":
		return "image/webp"
	case ".gif":
		return "image/gif"
	}
	return ""
}

var numbers = regexp.MustCompile(`\d+|\D+`)

func naturalLess(a, b string) bool {
	aa, bb := numbers.FindAllString(strings.ToLower(a), -1), numbers.FindAllString(strings.ToLower(b), -1)
	for i := 0; i < len(aa) && i < len(bb); i++ {
		if aa[i] == bb[i] {
			continue
		}
		x, e1 := strconv.ParseUint(aa[i], 10, 64)
		y, e2 := strconv.ParseUint(bb[i], 10, 64)
		if e1 == nil && e2 == nil && x != y {
			return x < y
		}
		return aa[i] < bb[i]
	}
	return len(aa) < len(bb)
}
func zipRead(z *zip.Reader, name string, limit uint64) ([]byte, error) {
	for _, entry := range z.File {
		if entry.Name == name {
			if entry.UncompressedSize64 > limit {
				return nil, fmt.Errorf("文件内容超过在线读取限制")
			}
			f, err := entry.Open()
			if err != nil {
				return nil, err
			}
			defer f.Close()
			data, err := io.ReadAll(io.LimitReader(f, int64(limit)+1))
			if uint64(len(data)) > limit {
				return nil, fmt.Errorf("文件过大")
			}
			return data, err
		}
	}
	return nil, fmt.Errorf("归档内容不存在")
}
func (r *Reader) Image(ctx context.Context, root, name string, book *Book, index int, cover bool) ([]byte, string, error) {
	if err := ctx.Err(); err != nil {
		return nil, "", err
	}
	r.initialize()
	select {
	case r.imageSlots <- struct{}{}:
		defer func() { <-r.imageSlots }()
	case <-ctx.Done():
		return nil, "", ctx.Err()
	}
	entry := ""
	if cover {
		if len(book.images) > 0 {
			entry = book.images[0]
		} else {
			entry = book.cover
		}
	} else if index >= 0 && index < len(book.images) {
		entry = book.images[index]
	}
	if entry == "" {
		return nil, "", fmt.Errorf("图片不存在")
	}
	file, err := openSource(root, name)
	if err != nil {
		return nil, "", err
	}
	defer file.Close()
	stat, err := file.Stat()
	if err != nil {
		return nil, "", err
	}
	z, err := zip.NewReader(file, stat.Size())
	if err != nil {
		return nil, "", err
	}
	data, err := zipRead(z, entry, 40<<20)
	return data, imageType(entry), err
}
func (b *Book) Chapter(index int) ([]string, error) {
	if index < 0 || index >= len(b.contents) {
		return nil, fmt.Errorf("章节不存在")
	}
	return b.contents[index], nil
}
func readEPUB(book *Book, z *zip.Reader) error {
	raw, err := zipRead(z, "META-INF/container.xml", 1<<20)
	if err != nil {
		return fmt.Errorf("EPUB 缺少目录文件")
	}
	var container struct {
		Files []struct {
			Path string `xml:"full-path,attr"`
		} `xml:"rootfiles>rootfile"`
	}
	if xml.Unmarshal(raw, &container) != nil || len(container.Files) == 0 {
		return fmt.Errorf("EPUB 目录无效")
	}
	opf := container.Files[0].Path
	raw, err = zipRead(z, opf, 4<<20)
	if err != nil {
		return err
	}
	var pkg struct {
		Manifest []struct {
			ID         string `xml:"id,attr"`
			Href       string `xml:"href,attr"`
			Properties string `xml:"properties,attr"`
		} `xml:"manifest>item"`
		Spine []struct {
			ID string `xml:"idref,attr"`
		} `xml:"spine>itemref"`
		Meta []struct {
			Name    string `xml:"name,attr"`
			Content string `xml:"content,attr"`
		} `xml:"metadata>meta"`
	}
	if xml.Unmarshal(raw, &pkg) != nil {
		return fmt.Errorf("EPUB 章节索引无效")
	}
	files := map[string]string{}
	coverID := ""
	for _, meta := range pkg.Meta {
		if meta.Name == "cover" {
			coverID = meta.Content
		}
	}
	for _, item := range pkg.Manifest {
		entry := path.Clean(path.Join(path.Dir(opf), strings.Split(item.Href, "#")[0]))
		files[item.ID] = entry
		if strings.Contains(item.Properties, "cover-image") || item.ID == coverID {
			book.cover = entry
		}
	}
	total := 0
	for _, item := range pkg.Spine {
		if len(book.Chapters) >= 5000 {
			return fmt.Errorf("EPUB 章节过多")
		}
		data, err := zipRead(z, files[item.ID], 4<<20)
		if err != nil {
			return err
		}
		total += len(data)
		if total > 64<<20 {
			return fmt.Errorf("EPUB 正文超过在线读取限制")
		}
		title, paragraphs := htmlText(data)
		if len(paragraphs) == 0 {
			continue
		}
		if title == "" {
			title = "第 " + strconv.Itoa(len(book.Chapters)+1) + " 节"
		}
		book.Chapters = append(book.Chapters, Chapter{title})
		book.contents = append(book.contents, paragraphs)
	}
	book.Count = len(book.Chapters)
	if book.Count == 0 {
		return fmt.Errorf("EPUB 没有可读文字章节")
	}
	return nil
}
func htmlText(data []byte) (string, []string) {
	doc, err := html.Parse(bytes.NewReader(data))
	if err != nil {
		return "", nil
	}
	title := ""
	var out []string
	var text strings.Builder
	flush := func() {
		s := strings.TrimSpace(text.String())
		if s != "" {
			out = append(out, s)
		}
		text.Reset()
	}
	var walk func(*html.Node)
	walk = func(n *html.Node) {
		if n.Type == html.ElementNode {
			if n.Data == "script" || n.Data == "style" || n.Data == "head" {
				return
			}
			if n.Data == "p" || n.Data == "div" || n.Data == "br" || n.Data == "h1" || n.Data == "h2" || n.Data == "li" {
				flush()
			}
		}
		if n.Type == html.TextNode {
			text.WriteString(n.Data)
		}
		start := len(out)
		for c := n.FirstChild; c != nil; c = c.NextSibling {
			walk(c)
		}
		if n.Type == html.ElementNode && (n.Data == "p" || n.Data == "div" || n.Data == "h1" || n.Data == "h2" || n.Data == "li") {
			flush()
			if (n.Data == "h1" || n.Data == "h2") && title == "" && len(out) > start {
				title = out[start]
			}
		}
	}
	walk(doc)
	flush()
	return title, out
}
