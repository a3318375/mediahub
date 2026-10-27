package reading

import (
	"context"
	"mediahub/internal/ehentai"
	"strings"
	"unicode"
)

type GallerySource interface {
	Search(context.Context, string, string, string, string, string, string) (ehentai.Results, error)
	Details(context.Context, string, string, string, string) (ehentai.Gallery, error)
}

// Keep the source title recognizable, removing only common download suffixes.
func ComicSearchName(title string) string {
	title = strings.TrimSpace(title)
	for _, suffix := range []string{".cbz", ".cbr"} {
		if strings.HasSuffix(strings.ToLower(title), suffix) {
			title = title[:len(title)-len(suffix)]
		}
	}
	return strings.TrimSpace(title)
}

func normalizedComicName(s string) string {
	return strings.Map(func(r rune) rune {
		if unicode.IsLetter(r) || unicode.IsDigit(r) {
			return unicode.ToLower(r)
		}
		return -1
	}, s)
}

// A search result is never accepted just because it is the first result.
func galleryMatch(title string, results []ehentai.Gallery) *ehentai.Gallery {
	needle := normalizedComicName(title)
	if needle == "" {
		return nil
	}
	best, score := -1, 0.0
	for i, g := range results {
		for _, candidate := range []string{g.Title, g.JapaneseTitle} {
			n := normalizedComicName(candidate)
			if n == "" {
				continue
			}
			s := 0.0
			if n == needle {
				s = 1
			} else if strings.Contains(n, needle) || strings.Contains(needle, n) {
				min, max := len([]rune(n)), len([]rune(needle))
				if min > max {
					min, max = max, min
				}
				if min >= 6 {
					s = float64(min) / float64(max)
				}
			}
			if s > score {
				best, score = i, s
			}
		}
	}
	if best < 0 || score < 0.65 {
		return nil
	}
	return &results[best]
}

// Try Chinese first across source priority, then repeat without the language filter.
func FindComicMetadata(ctx context.Context, source GallerySource, cookie, title string) (*ehentai.Gallery, error) {
	sites := []string{"e-hentai.org"}
	if strings.TrimSpace(cookie) != "" {
		sites = []string{"exhentai.org", "e-hentai.org"}
	}
	var lastErr error
	hadResponse := false
	query := ComicSearchName(title)
	if query == "" {
		return nil, nil
	}
	for _, language := range []string{"chinese", ""} {
		for _, site := range sites {
			if err := ctx.Err(); err != nil {
				return nil, err
			}
			results, err := source.Search(ctx, site, cookie, query, "", language, "")
			if err != nil {
				lastErr = err
				continue
			}
			hadResponse = true
			match := galleryMatch(query, results.Items)
			if match == nil {
				continue
			}
			g, err := source.Details(ctx, site, cookie, match.ID, match.Token)
			if err != nil {
				lastErr = err
				continue
			}
			if g.ID != "" && g.Title != "" {
				return &g, nil
			}
		}
	}
	if hadResponse {
		return nil, nil
	}
	return nil, lastErr
}

func FillComicMetadata(old, next ehentai.Gallery) ehentai.Gallery {
	if old.Title == "" {
		old.Title = next.Title
	}
	if old.JapaneseTitle == "" {
		old.JapaneseTitle = next.JapaneseTitle
	}
	if old.ID == "" {
		old.ID = next.ID
		old.Token = next.Token
		old.Site = next.Site
	}
	if old.Cover == "" {
		old.Cover = next.Cover
	}
	if old.Category == "" {
		old.Category = next.Category
	}
	if old.Uploader == "" {
		old.Uploader = next.Uploader
	}
	if old.Posted == "" {
		old.Posted = next.Posted
	}
	if old.Language == "" {
		old.Language = next.Language
	}
	if old.Rating == "" {
		old.Rating = next.Rating
	}
	if old.Pages == 0 {
		old.Pages = next.Pages
	}
	if old.Tags == nil {
		old.Tags = map[string][]string{}
	}
	for ns, tags := range next.Tags {
		if len(old.Tags[ns]) == 0 {
			old.Tags[ns] = tags
		}
	}
	return old
}
