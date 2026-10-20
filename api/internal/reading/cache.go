package reading

// Book caches hold at most four entries and an estimated 64 MiB of parsed
// content. Parsing and disk access never run under the cache mutex.
const readerCacheBudget int64 = 64 << 20

func bookSize(book *Book) int64 {
	size := int64(128 + len(book.cover) + len(book.Format))
	for _, name := range book.images {
		size += int64(len(name) + 16)
	}
	for _, chapter := range book.Chapters {
		size += int64(len(chapter.Title) + 16)
	}
	for _, paragraphs := range book.contents {
		size += 24
		for _, paragraph := range paragraphs {
			size += int64(len(paragraph) + 16)
		}
	}
	return size
}
func (r *Reader) cached(key, signature string) *Book {
	r.mu.Lock()
	defer r.mu.Unlock()
	value, ok := r.cache[key]
	if !ok || value.signature != signature {
		return nil
	}
	r.clock++
	value.used = r.clock
	r.cache[key] = value
	return value.book
}
func (r *Reader) remember(key, signature string, book *Book) {
	size := bookSize(book)
	r.mu.Lock()
	defer r.mu.Unlock()
	if old, ok := r.cache[key]; ok {
		r.bytes -= old.size
		delete(r.cache, key)
	}
	if size > readerCacheBudget {
		return
	}
	if r.cache == nil {
		r.cache = map[string]cachedBook{}
	}
	for len(r.cache) >= 4 || r.bytes+size > readerCacheBudget {
		oldest := ""
		var stamp uint64 = ^uint64(0)
		for name, entry := range r.cache {
			if entry.used < stamp {
				oldest = name
				stamp = entry.used
			}
		}
		entry, ok := r.cache[oldest]
		if !ok {
			break
		}
		r.bytes -= entry.size
		delete(r.cache, oldest)
	}
	r.clock++
	r.cache[key] = cachedBook{signature: signature, book: book, size: size, used: r.clock}
	r.bytes += size
}
