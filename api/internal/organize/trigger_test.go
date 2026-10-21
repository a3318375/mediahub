package organize

import (
	"context"
	"errors"
	"mediahub/internal/download"
	"testing"
)

var errTriggerPreview = errors.New("shared preview reached")

type triggerRepository struct{}

func (triggerRepository) ReadSecret(string, string) (string, error) { return "", nil }
func (triggerRepository) OrganizeRules() ([]Rule, error) {
	return []Rule{{ID: "global", Simple: true, Enabled: false}}, nil
}
func (triggerRepository) OrganizeRule(string) (Rule, error)                  { return Rule{}, errTriggerPreview }
func (triggerRepository) OrganizePlans(bool) ([]Plan, error)                 { return nil, nil }
func (triggerRepository) OrganizePlan(string) (Plan, error)                  { return Plan{}, nil }
func (triggerRepository) CreateOrganizePlan(p Plan) (Plan, error)            { return p, nil }
func (triggerRepository) SaveOrganizePlan(Plan) error                        { return nil }
func (triggerRepository) OrganizeRan(string, string) (bool, error)           { return false, nil }
func (triggerRepository) OrganizeLookup(string) Lookup                       { return nil }
func (triggerRepository) OrganizeUnfinished(string) ([]download.Task, error) { return nil, nil }

func TestProcessingTriggerReusesSchedulerWithoutEnablingCron(t *testing.T) {
	s := &Service{Store: triggerRepository{}}
	if err := s.Tick(context.Background()); err != nil {
		t.Fatalf("disabled cron ran: %v", err)
	}
	if err := s.tick(context.Background(), true); !errors.Is(err, errTriggerPreview) {
		t.Fatalf("manual run did not reach the shared preview: %v", err)
	}
	for i := 0; i < 10; i++ {
		s.Trigger()
	}
	if len(s.wakeChannel()) != 1 {
		t.Fatal("repeated triggers were not coalesced")
	}
}
