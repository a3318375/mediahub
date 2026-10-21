package store

import (
	"mediahub/internal/mediaoutput"
	"mediahub/internal/pan115"
	"testing"
)

func TestOutputTokenIsScopedToAccountFileAndFingerprint(t *testing.T) {
	s := &Store{secretKey: []byte("01234567890123456789012345678901")}
	output := mediaoutput.Output{AccountID: "1", File: pan115.File{ID: "2", Size: 10, SHA1: "a"}}
	token := s.OutputToken(output)
	if len(token) != 64 || token != s.OutputToken(output) {
		t.Fatal("token was not stable")
	}
	for _, mutate := range []func(*mediaoutput.Output){func(o *mediaoutput.Output) { o.AccountID = "3" }, func(o *mediaoutput.Output) { o.File.ID = "4" }, func(o *mediaoutput.Output) { o.File.Size = 11 }, func(o *mediaoutput.Output) { o.File.SHA1 = "b" }} {
		copy := output
		mutate(&copy)
		if s.OutputToken(copy) == token {
			t.Fatal("token accepted a different scope")
		}
	}
}
