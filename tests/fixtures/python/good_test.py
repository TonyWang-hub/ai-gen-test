import pytest

def add(a: int, b: int) -> int:
    return a + b

def divide(a: int, b: int) -> float:
    return a / b

class TestAdd:
    def test_adds_two_numbers(self) -> None:
        result = add(2, 3)
        assert result == 5

    def test_add_with_zero(self) -> None:
        assert add(0, 5) == 5
        assert add(5, 0) == 5

    def test_add_with_negative(self) -> None:
        assert add(-1, 1) == 0

class TestDivide:
    def test_divides_two_numbers(self) -> None:
        result = divide(10, 2)
        assert result == 5.0

    def test_divide_by_zero_raises(self) -> None:
        with pytest.raises(ZeroDivisionError):
            divide(1, 0)
