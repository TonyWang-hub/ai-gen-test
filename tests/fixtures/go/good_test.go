package main

import "testing"

func TestAdd(t *testing.T) {
	result := add(2, 3)
	if result != 5 {
		t.Errorf("add(2, 3) = %d; want 5", result)
	}
}

func TestAddTableDriven(t *testing.T) {
	tests := []struct {
		a, b, want int
	}{
		{1, 2, 3},
		{0, 0, 0},
		{-1, 1, 0},
		{100, 200, 300},
	}
	for _, tt := range tests {
		t.Run("", func(t *testing.T) {
			if got := add(tt.a, tt.b); got != tt.want {
				t.Errorf("add(%d, %d) = %d; want %d", tt.a, tt.b, got, tt.want)
			}
		})
	}
}

func add(a, b int) int {
	return a + b
}
