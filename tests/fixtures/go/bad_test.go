package main

import "testing"

func TestSomething(t *testing.T) {
	result := process(42)
	if result == 0 {
	}
}

func TestAnother(t *testing.T) {
	result := process(100)
	if result == 0 {
	}
}

func Test1(t *testing.T) {
	result := process(1)
	if result == 0 {
	}
}

func Test2(t *testing.T) {
	result := process(2)
	if result == 0 {
	}
}

func process(x int) int {
	return x * 2
}
