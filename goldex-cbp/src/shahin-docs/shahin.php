<?php 
error_reporting(E_ALL);
ini_set('display_errors', 1);

function func_shahin_api($methode,$endpoint,$data)
{
    $token = val_token;
    $base_url = val_shahin_url;
    $base_url_port_service = val_shahin_port_service;
    $base_url_version = val_shahin_version;
    $uuid = func_gen_uuid();
    $year = date("Y");
    $client_id = val_shahin_client_id;
    $client_secret = val_shahin_client_secret;
    $timestamp = time() * 1000;
    $key = $year.$client_id.$client_secret;
    $key_sign = hash('sha256', $key,1);
	$data_final_json = json_encode($data,JSON_UNESCAPED_UNICODE);
	$data_payload = $data_final_json;
	$data_payload = str_replace('"', "", $data_payload);
	$data_payload = str_replace(':', "=", $data_payload);
	$data_payload = str_replace(' ', "", $data_payload);
	$sign_body = strtoupper(hash('sha256', $data_payload));
    $canonical = $methode."\n/".$base_url_version.$endpoint."\nx-obh-timestamp:$timestamp\nx-obh-uuid:$uuid\n\nx-obh-timestamp;x-obh-uuid\n$sign_body";
    $string2sign = strtoupper(hash('sha256', $canonical));
    $final_sign = strtoupper(hash_hmac('sha256', $string2sign, $key_sign,0));
    $header = array
    (
    	'Content-Type: application/json',
    	'charset=utf-8',
    	"X-Obh-timestamp: ". $timestamp,
		"X-Obh-uuid:".$uuid,
    	"X-Obh-signature: OBH1-HMAC-SHA256;SignedHeaders=X-Obh-uuid,X-Obh-timestamp;signature=".$final_sign,
		"Authorization: Bearer ".$token
    );
    $curl = curl_init();
	curl_setopt_array($curl, array
	(
  		CURLOPT_URL => "$base_url:$base_url_port_service/$base_url_version$endpoint",
  		CURLOPT_RETURNTRANSFER => true,
  		CURLOPT_ENCODING => '',
	    CURLOPT_SSLCERT =>  dirname(__FILE__).'\org_cer_bundle.pfx',
	    CURLOPT_SSL_VERIFYHOST => 2,
	    CURLOPT_SSL_VERIFYPEER =>  false,
    	CURLOPT_SSLCERTTYPE => 'P12',
	    CURLOPT_KEYPASSWD => val_shahin_key_password,
	    CURLOPT_SSLCERTPASSWD => val_shahin_key_password,
  		CURLOPT_MAXREDIRS => 10,
  		CURLOPT_TIMEOUT => 0,
  		CURLOPT_FOLLOWLOCATION => true,
  		CURLOPT_HTTP_VERSION => CURL_HTTP_VERSION_1_1,
  		CURLOPT_CUSTOMREQUEST => 'POST',
  		CURLOPT_POSTFIELDS => $data_final_json,
  		CURLOPT_HTTPHEADER => $header
	));
	$response = curl_exec($curl);
  	$http_status = curl_getinfo($curl, CURLINFO_HTTP_CODE);
  	$info = curl_getinfo($curl);
	if (curl_errno($curl)) {$error_msg = curl_error($curl); echo "fartid";}
	if (isset($error_msg)) {echo "mary";}
	curl_close($curl);
	return json_decode($response);
}
function func_shahin_Transfer_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/pisp/transfer";
	$data = array
	(
		"bank" => val_shahin_company_bank,
		"nationalCode" => val_shahin_company_nationaldcode,
		"destinationAccountNumber" => "IR720120020000004321545974",
		"amount" => 100000000,
		"destinationBank" =>"MEL",
		"sourceAccount" => val_shahin_company_bank_id,
		"withdrawDescription" => "withdraw desc",
		"destinationAccountName" => "فرید صنیعی پور",
		"transferType" => "PAYA",
		"documentID" =>"116e1",
		"depositDescription" =>"deposit_TEST"
	);
	return func_shahin_api($methode,$endpoint,$data);
}
function func_shahin_TransferValidation_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/pisp/transfer-validation";
	$data = array
	(
		"amount" => "100",
		"bank" => val_shahin_company_bank,
		"depositDescription" =>"deposit_TEST",
		"destinationAccountName" =>"",
		"destinationAccountNumber" => "IR720120020000004321545974",
		"destinationBank" =>"MEL",
		"documentID" =>"116e2",
		"nationalCode" => val_shahin_company_nationaldcode,
		"paymentID" =>"226e1",
		"sourceAccount" => val_shahin_company_bank_id,
		"withdrawDescription" => "withdrawDescription_TEST",
		"transferType" => "LOCAL"
	);
	return func_shahin_api($methode,$endpoint,$data);
}
function func_return_shahin_getIBANInfo_2Way($iban)
{
	$methode = "POST";
	$endpoint = "/obh/api/aisp/get-iban-info";
	$data = array
	(
		"bank" => val_shahin_company_bank,
		"nationalCode" => val_shahin_company_nationaldcode,
		"sourceAccount" => $iban
	);
	$response = func_shahin_api($methode,$endpoint,$data);
	$transaction_stats = $response['transactionState'];
	$status_code = 0;
	if($transaction_stats == "SUCCESS"){$status_code = 200;}

	$account_status = $response['respObject']['accountStatus'];
	$status = false;
	if($account_status == "Active"){$status = true;}
	$data = array
	(
		"bank" => $response['respObject']['bank'],
		"account_number" => $response['respObject']['accountNumber'],
		"account_status" => $status,
		"iban" => $response['respObject']['ibanNumber'],
		"owner" => array
		(
			array("name_first" => $response['respObject']['firstName'], "name_last" => $response['respObject']['lastName'])
		),
		"national_code" => $response['respObject']['nationalCode'],
		"description" => ""
	);
	$status = array("code" => $status_code);
	$result = array("status" => $status,"data" => $data);
	return $result;
}
function func_shahin_checkIBANNationalCode()
{
	$methode = "POST";
	$endpoint = "/obh/api/inquiry/check-iban-nationalcode";
	$data = array
	(
		"nationalCode" => "0081123035",
		"birthDate" => "13650230",
		"iban" => "IR720120020000004321545974"
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}
function func_shahin_getNationalCodeIdentity()
{
	$methode = "POST";
	$endpoint = "/obh/api/inquiry/get-national-identity";
	$data = array
	(
		"nationalCode" => "0081123035",
		"birthDate" => "13650230"
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}
function func_shahin_getAccountBalance_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/aisp/get-account-balance";
	$data = array
	(
		"bank" => val_shahin_company_bank,
		"sourceAccount" => val_shahin_company_bank_id,
		"nationalCode" => val_shahin_company_nationaldcode
	);
	return func_shahin_api($methode,$endpoint,$data);
}
function func_shahin_getAccountInfo_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/aisp/get-account-info";
	$data = array
	(
		"bank" => val_shahin_company_bank,
		"sourceAccount" => val_shahin_company_bank_id,
		"nationalCode" => val_shahin_company_nationaldcode
	);
	return func_shahin_api($methode,$endpoint,$data);
}
function func_shahin_CheckPhoneValidity() //unauthurised
{
	$methode = "POST";
	$endpoint = "/obh/api/inquiry/check-phone-validity";
	$data = array
	(
		"mobileNumber" => "09122763719",
		"nationalCode" => "0081123035"
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}
function func_shahin_GetCustomerInfo_2Way() //unauthurised
{
	$methode = "POST";
	$endpoint = "/obh/api/aisp/get-basic-custinfo";
	$data = array
	(
		"sourceAccount" => val_shahin_company_bank_id,
		"bank" => val_shahin_company_bank,
		"nationalCode" => "0081123035"
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}
function func_return_shahin_GetCardInfo_2Way($card)
{
	$methode = "POST";
	$endpoint = "/obh/api/card/get-card-info";
	$data = array
	(
		"sourceAccount" => val_shahin_company_bank_id,
		"bank" => val_shahin_company_bank,
		"nationalCode" => val_shahin_company_nationaldcode,
		"cardNumber" => $card
	);
	$response = func_shahin_api($methode,$endpoint,$data);
	$transaction_stats = $response['transactionState'];
	$status_code = 0;
	if($transaction_stats == "SUCCESS"){$status_code = 200;}
	$data = array
	(
		"bank" => $response['respObject']['bank'],
		"account_number" => $response['respObject']['accountNumber'],
		"iban" => $response['respObject']['iban'],
		"owner" => $response['respObject']['ownerName'],
		"description" => ""
	);
	$status = array("code" => $status_code);
	$result = array("status" => $status,"data" => $data);
	return $result;
}
function func_shahin_GetCardBalance_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/card/card-balance";
	$data = array
	(
		"sourceAccount" => val_shahin_company_bank_id,
		"bank" => val_shahin_company_bank,
		"nationalCode" => val_shahin_company_nationaldcode,
		"cardInfo" => array
		(
			"cardNumber" => "5022291092650199",
			"cvv2" => "877",
			"cvv2Encoding" => "PLAIN",
			"expireDate" => "0402",
			"pin" => "15252",
			"pinEncoding" => "PLAIN",
		)
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}

function func_shahin_GetCardTransfer_2Way()
{
	$methode = "POST";
	$endpoint = "/obh/api/card/card-transfer";
	$data = array
	(
		"amount" => 10000,
		"sourceAccount" => val_shahin_company_bank_id,
		"bank" => val_shahin_company_bank,
		"nationalCode" => val_shahin_company_nationaldcode,
		"destinationCardNumber" => "5022291092650199",
		"sourceCardInfo" => array
		(
			"cardNumber" => "6104337687184380",
			"cvv2" => "724",
			"cvv2Encoding" => "PLAIN",
			"expireDate" => "140406",
			"pin" => "15252",
			"pinEncoding" => "PLAIN"
		)
	);
	$result = func_shahin_api($methode,$endpoint,$data);
	return $result;
}
?>