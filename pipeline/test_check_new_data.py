import datetime as dt
import sys
import types
import unittest
from unittest.mock import Mock, patch


# 단위 테스트는 네트워크를 사용하지 않는다. requests가 없는 최소 Python
# 환경에서도 검사할 수 있도록 check_new_data가 요구하는 표면만 제공한다.
requests_stub = types.ModuleType("requests")


class RequestException(Exception):
    pass


class Timeout(RequestException):
    pass


requests_stub.RequestException = RequestException
requests_stub.Timeout = Timeout
requests_stub.get = Mock()
sys.modules.setdefault("requests", requests_stub)

from check_new_data import KST, latest_available_date


@patch("check_new_data.API_KEY", "test-key")
class CheckNewDataTest(unittest.TestCase):
    @patch("check_new_data.requests.get")
    def test_returns_latest_date_from_successful_response(self, get: Mock):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "response": {"body": {"totalCount": 1}}
        }
        get.return_value = response

        self.assertEqual(
            latest_available_date(), dt.datetime.now(KST).date().isoformat()
        )

    @patch("check_new_data.requests.get")
    def test_reachable_api_with_no_rows_is_not_an_outage(self, get: Mock):
        response = Mock()
        response.raise_for_status.return_value = None
        response.json.return_value = {
            "response": {"body": {"totalCount": 0}}
        }
        get.return_value = response

        self.assertIsNone(latest_available_date())

    @patch("check_new_data.requests.get", side_effect=Timeout("timeout"))
    def test_all_request_failures_are_reported(self, _get: Mock):
        with self.assertRaisesRegex(RuntimeError, "모두 실패"):
            latest_available_date()


if __name__ == "__main__":
    unittest.main()
