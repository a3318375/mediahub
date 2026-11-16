package tv

import (
	"mediahub/internal/organize"
	"mediahub/internal/pan115"
)

type EpisodeFile struct {
	File      pan115.File `json:"file"`
	Season    int         `json:"season"`
	Episode   int         `json:"episode"`
	Organized bool        `json:"organized"`
}

// Replacement stores resumable, user-authorized work in the existing subscription.
// Credentials stay in the encrypted download task secret store.
type Replacement struct {
	ID            string        `json:"id"`
	Season        int           `json:"season"`
	Episode       int           `json:"episode"`
	AccountID     string        `json:"accountId"`
	TaskID        string        `json:"taskId"`
	TempID        string        `json:"tempId"`
	OldTempID     string        `json:"oldTempId"`
	DestinationID string        `json:"destinationId"`
	OldFiles      []EpisodeFile `json:"oldFiles"`
	NewFile       *pan115.File  `json:"newFile,omitempty"`
	Resource      Candidate     `json:"resource"`
	Organized     bool          `json:"organized"`
	Rule          organize.Rule `json:"rule"`
	PlanID        string        `json:"planId,omitempty"`
	State         string        `json:"state"`
	Error         string        `json:"error,omitempty"`
	CreatedAt     string        `json:"createdAt"`
}
