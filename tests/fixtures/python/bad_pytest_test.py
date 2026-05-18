import pytest
from unittest.mock import patch, MagicMock

def process_data(data: list[int]) -> int:
    return sum(data)

def send_email(to: str, subject: str) -> bool:
    return True

class TestProcessData:
    def test_1(self) -> None:
        result = process_data([1, 2, 3])
        assert result is not None

    def test_2(self) -> None:
        result = process_data([])
        assert result is not None

    def test_3(self) -> None:
        result = process_data([1])
        assert result is not None

    def test_something(self) -> None:
        pass

class TestEmail:
    @patch('smtplib.SMTP')
    def test_sends_email(self, mock_smtp: MagicMock) -> None:
        mock_instance = MagicMock()
        mock_smtp.return_value = mock_instance
        mock_instance.send.return_value = True
        mock_instance.quit.return_value = None

        result = send_email('a@test.com', 'Hello')
        assert result is not None
