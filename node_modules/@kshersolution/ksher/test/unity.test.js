const Unity = require("../src/unity");

describe("Unity", () => {
  test("generateRandomString", () => {
    const random = Unity.generateRandomString(32);
    expect(random.length).toEqual(32);
    expect(typeof random).toBe("string");
  });

  test("convertData2Str", () => {
    const exampleGatewayCreateData = {
      appid: "mch35005",
      channel_list:
        "promptpay,linepay,airpay,truemoney,atome,card,ktc_instal,kbank_instal,kcc_instal,kfc_instal,scb_easy,bbl_deeplink,baybank_deeplink,kplus,alipay,wechat,card,ktc_instal,kbank_instal,kcc_instal,kfc_instal",
      fee_type: "THB",
      lang: "en",
      mch_code: "2023-02-22-17-11-00",
      mch_notify_url: "https://www.yourweb.com/api/gateway_pay/notify_url/",
      mch_order_no: "2023-02-22-17-11-00",
      mch_redirect_url: "https://www.yourweb.com/api/gateway_pay/success",
      mch_redirect_url_fail: "https://www.yourweb.com/api/gateway_pay/fail",
      nonce_str: "a2de1d78127dd837e648ef0c28773fcb",
      product_name: "2023-02-20-17-27-00",
      refer_url: "https://www.yourweb.com",
      sign: "5a665ecc4e1a94f01de579a9dd1c4850984066a7d4b479bb3bc3d8872c5ac871a3e868efdf9da0b8baaac1cd3f3ce789f7e6e677fb8ff25ea1b872c387980161db485ed84e28c9ae064dacae877d8855deb4bb3332499e9a5f73675377e0fa7baf66f8129299c4e505439501e2088abfed1558a9a2bff39a582dcf36b364a049",
      time_stamp: "2023030317445454S",
      total_fee: "100",
    };

    const exampleGatewayCreate_textVerify =
      "appid=mch35005channel_list=promptpay,linepay,airpay,truemoney,atome,card,ktc_instal,kbank_instal,kcc_instal,kfc_instal,scb_easy,bbl_deeplink,baybank_deeplink,kplus,alipay,wechat,card,ktc_instal,kbank_instal,kcc_instal,kfc_instalfee_type=THBlang=enmch_code=2023-02-22-17-11-00mch_notify_url=https://www.yourweb.com/api/gateway_pay/notify_url/mch_order_no=2023-02-22-17-11-00mch_redirect_url=https://www.yourweb.com/api/gateway_pay/successmch_redirect_url_fail=https://www.yourweb.com/api/gateway_pay/failnonce_str=a2de1d78127dd837e648ef0c28773fcbproduct_name=2023-02-20-17-27-00refer_url=https://www.yourweb.comtime_stamp=2023030317445454Stotal_fee=100";

    const text_make_sign = Unity.convertData2Str(exampleGatewayCreateData);
    expect(text_make_sign).toEqual(exampleGatewayCreate_textVerify);
  });

  test("isPrivateKeyPEMFormat", () => {
    examplePath = '/ksher_pubkey.pem';
    const pathFormat = Unity.isPrivateKeyPEMFormat(examplePath);
    expect(pathFormat).toEqual(false);

    privatekey = `-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAMhFg7PoOgSvUWzfTv4xerdNRc0lZMGTh71dV3g0d4GEO88tOlph
LTPVnBGVvpvFvhYDgDQqWtGIm8NIHopQDJsCAwEAAQJADYmVY33ZHiPzrxZRMqGJ
mAZjJ4DVlLgyPrymgvuY8GovDisXC/4Oo2JCwGJLJEiYWvWJqkLIMnMfF9Mj6pEx
oQIhAPxbrlTCZsoxIXoftfA79EoXpPyJnQ26C4dcbkxQOAWZAiEAyylnP8uxMOIP
MsgXT1LF+WTGfw4JZyQCmJDKlIbFnFMCIHU6caVWGUHbyN1eVbofX7/7c90MYDS8
NBbRTTuOGDghAiEAoN2u4Kf0LOXC7Q3czzWWhyxRtEc0ENRFrfJwRf0VOfsCIFwg
IATE8U+GHPfygz0oBJwLfPaOAIdxup1x38UswEl/
-----END RSA PRIVATE KEY-----`;
  // this private key is example private key format cannot real use in system
    const privateKeyPEMFormat = Unity.isPrivateKeyPEMFormat(privatekey);
    expect(privateKeyPEMFormat).toEqual(true);
  });

});
