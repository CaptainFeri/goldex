import base64
import datetime
import hashlib
import hmac
import json
import time
import uuid

import requests
import requests_pkcs12


import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)

class Shaahin:
    def __init__(self):
        self.base_url = "https://YOUR_BASE_URL:{port}{path}"
        self.username = "SHAHIN_USERNAME"
        self.password = "SHAHIN_PASSWORD"
        self.nid = "SHAHIN_NATIONAL_CODE"
        self.bank = "SHAHIN_BANK"
        self.src_account = "SHAHIN_SOURCE_ACCOUNT"
        message_bytes = f"{self.username}:{self.password}".encode('utf8')
        base64_bytes = base64.b64encode(message_bytes)
        self.token_headers = {
            "Authorization": "Basic " + base64_bytes.decode('utf8'),
            "Content-Type": "application/json",
        }
        self.token = self._get_token(self.token_headers)
        self.pfx_cert = "PATH TO .pfx FILE"
        self.pfx_password = "SHAHIN_PFX_FILE_PASSWORD"
        self.headers = {
            "Authorization": "Bearer " + self.token,
            "Content-Type": "application/json",
        }

    def _create_headers(self, method, url, payload):
        obh_uuid = str(uuid.uuid4())
        obh_timestamp = self._get_timestamp()
        base_headers = {
            "X-Obh-timestamp": obh_timestamp,
            "X-Obh-uuid": obh_uuid,
        }
        signed_string = self._create_signature(method=method, url=url, headers=base_headers, payload=payload)
        obh_signature = f"OBH1-HMAC-SHA256;SignedHeaders=X-Obh-uuid,X-Obh-timestamp;Signature={signed_string}"
        headers = {
            "Content-Type": "application/json",
            "Authorization": f"Bearer {self.token}",
            **base_headers,
            "X-Obh-signature": obh_signature,
        }
        return headers

    def _get_token(self, headers):
        url = self.base_url.format(port="443", path="/v0.3/obh/oauth/token?grant_type=client_credentials")
        response = requests.post(
            url=url,
            json={},
            headers=headers,
            verify=False,
        )
        response_context = response.json()
        token = response_context.get("access_token")
        return token

    def _create_signature(self, method: str, url: str, headers: dict, payload: dict):
        headers_list = sorted(headers.items(), key=lambda x: x[0])
        canon_header_row = ""
        sign_header = ""
        for k, v in headers_list:
            k = k.lower()
            v = v.replace(" ", "")
            canon_header_row += f"{k}:{v}\n"
            sign_header += k + ";"
        sign_header = sign_header[:-1]
        payload = json.dumps(payload)
        payload = payload.replace(" ", "").replace("\"", "").replace(":", "=")
        hash_payload = self._encrypt_hex(payload)
        canonical_request = f"{method}\n{url}\n{canon_header_row}\n{sign_header}\n{hash_payload}"
        string_to_sign = self._encrypt_hex(canonical_request)
        signed_string = self._sign(string_to_sign)
        return signed_string

    def _sign(self, string_to_sign: str):
        key_to_sign = self._get_year() + self.username + self.password
        key = hashlib.sha256(key_to_sign.encode("utf8"))
        encoded_string_to_sign = string_to_sign.encode("utf8")
        signed_string = hmac.new(key.digest(), encoded_string_to_sign, hashlib.sha256).hexdigest()
        return signed_string.upper()

    @staticmethod
    def _get_timestamp():
        return str(time.time()).replace(".", "")[:13]

    @staticmethod
    def _encrypt_hex(string: str):
        sha_str = hashlib.sha256(string.encode("utf8")).hexdigest()
        return sha_str.upper()

    @staticmethod
    def _get_year():
        return str(datetime.datetime.now().year)

    def _send_request(self, data, method, path):
        headers = self._create_headers(method=method, url=path, payload=data)
        url = self.base_url.format(port="5443", path=path)
        response = requests_pkcs12.post(url=url, json=data, headers=headers, pkcs12_filename=self.pfx_cert,
                                        pkcs12_password=self.pfx_password, verify=False)
        return response
    
    ######################################
    ######################################
    # Put other methods here. For example:
    def check_phone_validity(self, mobile, national_code):
        data = {
            "nationalCode": national_code,
            "mobileNumber": mobile,
        }
        path = "/v0.3/obh/api/inquiry/check-phone-validity"
        response = self._send_request(data=data, method="POST", path=path)
        print(response.text)
        return response


api = Shaahin()
api.get_account_info()