package reading

import (
	"archive/zip"
	"bytes"
	"golang.org/x/text/encoding/simplifiedchinese"
	"testing"
)

func TestTextChaptersAndChineseEncoding(t *testing.T) {
	raw, e := simplifiedchinese.GB18030.NewEncoder().Bytes([]byte("第一章 初见\n这里是第一段。\n第二章 再会\n这里是第二段。"))
	if e != nil {
		t.Fatal(e)
	}
	text, e := decodeText(raw)
	if e != nil {
		t.Fatal(e)
	}
	book := &Book{}
	splitText(book, text)
	if book.Count != 2 || book.Chapters[1].Title != "第二章 再会" || book.contents[0][0] != "这里是第一段。" {
		t.Fatalf("wrong chapters: %+v", book)
	}
}
func TestNaturalPageOrder(t *testing.T) {
	if !naturalLess("page2.jpg", "page10.jpg") || naturalLess("page10.jpg", "page2.jpg") {
		t.Fatal("pages are not naturally sorted")
	}
}

func TestRejectTraversalBeforeOpeningSource(t *testing.T) {
	for _, name := range []string{"../secret.txt", "a/../../secret.txt"} {
		if file, err := openSource("unused", name); err == nil {
			file.Close()
			t.Fatalf("accepted traversal %s", name)
		}
	}
}
func TestEPUBSpineAndTextSanitization(t *testing.T) {
	var b bytes.Buffer
	w := zip.NewWriter(&b)
	entries := map[string]string{"META-INF/container.xml": `<container><rootfiles><rootfile full-path="OPS/book.opf"/></rootfiles></container>`, "OPS/book.opf": `<package><manifest><item id="one" href="one.xhtml"/><item id="two" href="two.xhtml"/></manifest><spine><itemref idref="two"/><itemref idref="one"/></spine></package>`, "OPS/one.xhtml": `<html><body><h1>第一章</h1><p>正文一</p></body></html>`, "OPS/two.xhtml": `<html><head><script>bad()</script></head><body><h1>第二章</h1><script>bad()</script><p>正文二</p></body></html>`}
	for name, text := range entries {
		f, e := w.Create(name)
		if e != nil {
			t.Fatal(e)
		}
		f.Write([]byte(text))
	}
	w.Close()
	z, e := zip.NewReader(bytes.NewReader(b.Bytes()), int64(b.Len()))
	if e != nil {
		t.Fatal(e)
	}
	book := &Book{}
	if e = readEPUB(book, z); e != nil {
		t.Fatal(e)
	}
	if book.Count != 2 || book.Chapters[0].Title != "第二章" {
		t.Fatalf("spine order: %+v", book)
	}
	for _, p := range book.contents[0] {
		if p == "bad()" {
			t.Fatal("script exposed")
		}
	}
}
