package pan115

import "fmt"

type FileGateway interface {
	Gateway
	CreateDirectory(parent, name string) (File, error)
	RenameFile(id, name string) error
	MoveFile(id, parent string) error
}

func (c *Client) RenameFile(id, name string) error { return SafeOperation(c.sdk.Rename(id, name)) }
func (c *Client) MoveFile(id, parent string) error { return SafeOperation(c.sdk.Move(parent, id)) }

// DeleteFile never accepts directories, even if a caller supplies the wrong ID.
func (c *Client) DeleteFile(id string) error {
	f, err := c.GetFile(id)
	if err != nil {
		return err
	}
	if f.Directory || id == "0" {
		return fmt.Errorf("只能删除指定文件，不能删除目录")
	}
	return SafeOperation(c.sdk.Delete(id))
}
func (c *Client) DeleteEmptyDirectory(id string) error {
	f, err := c.GetFile(id)
	if err != nil {
		return err
	}
	if !f.Directory || id == "0" {
		return fmt.Errorf("只能清理空文件夹")
	}
	items, err := c.ListFiles(id)
	if err != nil {
		return err
	}
	if len(items) != 0 {
		return fmt.Errorf("文件夹非空，停止清理")
	}
	return SafeOperation(c.sdk.Delete(id))
}
func SafeOperation(err error) error {
	if err == nil {
		return nil
	}
	return SafeError(err)
}
