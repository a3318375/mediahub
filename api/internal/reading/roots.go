package reading

import "runtime"

// Source paths are part of the application contract, not deployment settings.
func Roots() map[string]string {
	if runtime.GOOS == "windows" {
		return map[string]string{"comics": `D:\tmp\res\comics`, "novels": `D:\tmp\res\book`}
	}
	return map[string]string{"comics": "/comics", "novels": "/book"}
}
