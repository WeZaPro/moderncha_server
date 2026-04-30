const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const qs = require("qs");
const path = require("path");
const Unity = require("./unity");
const { error } = require("console");

class KsherPay {
  DOMAIN = "https://api.mch.ksher.net/KsherPay";
  GATEWAY_DOMAIN = "https://gateway.ksher.com/api";

  appid = "";
  privateKey = "";
  timeout = 0;
  _publicKey = `-----BEGIN RSA PUBLIC KEY-----
MEgCQQC+/eeTgrjeCPHmDS/5osWViFyIAryFRIr5canaYhz3Di3UNkT0sf6TkabF
LvxPcM9JmEtj2O4TXNpgYATkE/sFAgMBAAE=
-----END RSA PUBLIC KEY-----
`;
  ksherSignVersion = "";

  /**
   * @param {string} appid - appid
   * @param {string} privatekeyPath - Path to private key or private key text.
   * @param {string} publicKeyPath - (optional) Path to public key or public key text.
   * @param {number} timeout - (optional) Timeout for API call in milliseconds (0 = no timeout, e.g., 10000 = 10 seconds)
   */
  constructor(appid, privatekeyPath = "", publicKeyPath = "", timeout = 0) {
    this.appid = appid;

    // if (typeof appid !== "string") {
    //   throw new TypeError("appid must be a string");
    // }
    // if (typeof privatekeyPath !== "string") {
    //   throw new TypeError("privatekeyPath must be a string");
    // }
    // if (typeof publicKeyPath !== "string") {
    //   throw new TypeError("publicKeyPath must be a string");
    // }
    // if (typeof timeout !== "number") {
    //   throw new TypeError("timeout must be a number");
    // }

    if (Unity.isPrivateKeyPEMFormat(privatekeyPath)) {
      this.privateKey = privatekeyPath;
    } else {
      this.privateKey = fs.readFileSync(privatekeyPath);
    }

    if (publicKeyPath != "") {
      this._publicKey = fs.readFileSync(publicKeyPath);
    }

    if (this.timeout != 0) {
      this.timeout = timeout;
    }

  }
  set ksherSignVersion(value) {
    this._ksherSignVersion = value;

    // auto change publicKey when version changes
    if (value === "V2") {
      this._publicKey = `-----BEGIN RSA PUBLIC KEY-----
MIIBCgKCAQEA3WvHCgE/NVHjWG+IzjB2OeWFwjQJFPEi/O1AFaiLdsyXgQ8sROIM
pp7iyhbubKf+aNFdJx4+hwbVSd3BAUUdKQJyovdqjF0DLLrk0QLUZAnEX7lylugt
VL+eCKRhI8UzXxEFMt8vrhw1p9oaxBK/0mXcqUGvtM7hNAZo9jdfB/l+gAf6X3jR
1gj7lsz190A+FfDwzIhCWK8FcdroW7A00KAcCdAadzNdn16UNj4G0kGXhAMf+175
gTFuVuiZx1oSaInrOgnl05qqixTbrdm/BqwbFWGGYX1B6yKM0/Vus3DqkwgXr1q+
bWPtM3sDOQuQmkbo/jQbkMv+Ab8ij2f1gwIDAQAB
-----END RSA PUBLIC KEY-----
`;
    } else {
      this._publicKey = `-----BEGIN RSA PUBLIC KEY-----
MEgCQQC+/eeTgrjeCPHmDS/5osWViFyIAryFRIr5canaYhz3Di3UNkT0sf6TkabF
LvxPcM9JmEtj2O4TXNpgYATkE/sFAgMBAAE=
-----END RSA PUBLIC KEY-----
`;
    }
  }
  createSignature(data) {
    const keyvalue = Unity.convertData2Str(data);
    // console.log("string make signature: ", keyvalue)

    const signer = crypto.createSign("RSA-MD5");
    signer.write(keyvalue);
    signer.end();

    const signature = signer.sign(this.privateKey, "hex");

    // console.log(signature);
    return signature;
  }

  verifySignature(data) {
    var message = "";
    if (
      "mobile" in data.data &&
      "mch_id" in data.data &&
      "account_type" in data.data &&
      "business_mode" in data.data &&
      "nonce_str" in data.data
    ) {
      var merchant_info_verify_message = {
        mobile: data.data.mobile,
        mch_id: data.data.mch_id,
        account_type: data.data.account_type,
        business_mode: data.data.business_mode,
        nonce_str: data.data.nonce_str,
      };
      // console.log(merchant_info_verify_message);
      message = Unity.convertData2Str(merchant_info_verify_message);
    } else {
      message = Unity.convertData2Str(data.data);
    }

    const signature = data.sign;
    // console.log("verifySignature: ",signature)
    // console.log("text make sign: ",message)
    const verifier = crypto.createVerify("RSA-MD5");
    verifier.write(message);
    verifier.end();

    const isVerified = verifier.verify(this._publicKey, signature, "hex");

    // console.log(isVerified);
    return isVerified;
  }
  addRequestHeader(data) {
    const nonce_str = Unity.generateRandomString(32);
    var time_stamp = Date.now();
    var headerdata = {
      appid: this.appid,
      nonce_str: nonce_str,
      time_stamp: time_stamp,
    };
    return { ...headerdata, ...data };
  }

  async ksherRequest(url, method = "POST", data) {
    var dataWithHeader = this.addRequestHeader(data);
    var signature = this.createSignature(dataWithHeader);
    var bodyWithSign = { ...dataWithHeader, ...{ sign: signature } };
    var strdata = qs.stringify(bodyWithSign);

    var headers = { "Content-Type": "application/x-www-form-urlencoded" };
    if (this.ksherSignVersion != "")
      headers = { ...headers, ...{ "ksher-sign-version": "V2" } };
    // console.log("headers request: ", headers);
    // console.log("strdata:", strdata);
    // console.log("body request: ", bodyWithSign);

    var config = {
      method: method,
      timeout: this.timeout,
      url: url,
      headers: headers,
      data: strdata,
    };
    // console.log("config: ", config);
    const response = await axios(config);
    // console.log("response.data: ", response.data);
    // console.log("response.status: ", response.status);
    // console.log("response.statusText: ", response.statusText);
    // console.log("response.headers: ", response.headers);
    // console.log("response.config: ", response.config);
    const jsonData = JSON.stringify(response.data);

    if (response.status != 200) {
      return response.data;
    }

    if (response.data.code === 0 && !this.verifySignature(response.data)) {
      return {
        code: 0,
        data: {
          err_code: "VERIFY_KSHER_SIGN_FAIL",
          err_msg: "verify signature failed",
          result: "FAIL",
        },
        msg: "ok",
        sign: "",
        status_code: "",
        status_msg: "",
        time_stamp: "",
        version: "",
      };
    }

    return response.data;
  }
  gateway_pay(data) {
    const url = this.GATEWAY_DOMAIN + "/gateway_pay";
    if ("product_name" in data) {
      data.product_name = decodeURIComponent(data.product_name);
    }
    if ("mch_redirect_url" in data) {
      data.mch_redirect_url = decodeURIComponent(data.mch_redirect_url);
    }
    if ("mch_redirect_url_fail" in data) {
      data.mch_redirect_url_fail = decodeURIComponent(
        data.mch_redirect_url_fail
      );
    }
    if ("mch_notify_url" in data) {
      data.mch_notify_url = decodeURIComponent(data.mch_notify_url);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  gateway_order_query(data) {
    const url = this.GATEWAY_DOMAIN + "/gateway_order_query";
    // remove operator_id from query not support this param
    if ("operator_id" in data) {
      delete data.operator_id;
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  cancel_order(data) {
    const url = this.GATEWAY_DOMAIN + "/cancel_order";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  order_refund(data) {
    const url = this.DOMAIN + "/order_refund";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  order_reverse(data) {
    const url = this.DOMAIN + "/order_reverse";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  native_pay(data) {
    const url = this.DOMAIN + "/native_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("product" in data) {
      data.product = decodeURIComponent(data.product);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  order_query(data) {
    const url = this.DOMAIN + "/order_query";
    // remove operator_id from query not support this param
    if ("operator_id" in data) {
      delete data.operator_id;
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  quick_pay(data) {
    const url = this.DOMAIN + "/quick_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("product" in data) {
      data.product = decodeURIComponent(data.product);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  app_pay(data) {
    const url = this.DOMAIN + "/app_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("redirect_url" in data) {
      data.redirect_url = decodeURIComponent(data.redirect_url);
    }
    if ("refer_url" in data) {
      data.refer_url = decodeURIComponent(data.refer_url);
    }
    if ("product" in data) {
      data.product = decodeURIComponent(data.product);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  mini_program_pay(data) {
    const url = this.DOMAIN + "/mini_program_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("product" in data) {
      data.product = decodeURIComponent(data.product);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  wap_pay(data) {
    const url = this.DOMAIN + "/wap_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("redirect_url" in data) {
      data.redirect_url = decodeURIComponent(data.redirect_url);
    }
    if ("refer_url" in data) {
      data.refer_url = decodeURIComponent(data.refer_url);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  jsapi_pay(data) {
    const url = this.DOMAIN + "/jsapi_pay";
    if ("notify_url" in data) {
      data.notify_url = decodeURIComponent(data.notify_url);
    }
    if ("redirect_url" in data) {
      data.redirect_url = decodeURIComponent(data.redirect_url);
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  refund_query(data) {
    const url = this.DOMAIN + "/refund_query";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  order_close(data) {
    const url = this.DOMAIN + "/order_close";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  payout(data) {
    const url = this.DOMAIN + "/payout";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  order_query_payout(data) {
    const url = this.DOMAIN + "/order_query_payout";
    // remove operator_id from query not support this param
    if ("operator_id" in data) {
      delete data.operator_id;
    }
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  get_payout_balance(data) {
    const url = this.DOMAIN + "/get_payout_balance";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  rate_query(data) {
    const url = this.DOMAIN + "/rate_query";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  merchant_info(data) {
    const url = this.DOMAIN + "/merchant_info";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }

  get_settlement_info(data) {
    const url = this.DOMAIN + "/get_settlement_info";
    const resp = this.ksherRequest(url, "POST", data);
    return resp;
  }
}
module.exports = KsherPay;
