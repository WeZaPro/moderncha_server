 
# Ksher SDK nodejs
[![Node.js Package](https://github.com/ksher-api/ksher_sdk_nodejs/actions/workflows/npm-publish.yml/badge.svg)](https://github.com/ksher-api/ksher_sdk_nodejs/actions/workflows/npm-publish.yml)
[![Version](https://img.shields.io/npm/v/@kshersolution/ksher)](https://www.npmjs.com/package/@kshersolution/ksher)

This project is SDK for NodeJs. API Document Please check document at http://api.ksher.net

You can check [npm SDK NodeJs](https://www.npmjs.com/package/@kshersolution/ksher) or visit [Github ksher_demo_nodejs repo](https://github.com/ksher-solutions/ksher_demo_nodejs) for check example create on NodeJs.

Another SDK please check at

Java: https://github.com/ksher-api/ksher-sdk/tree/master/java

[![Version](https://img.shields.io/pypi/v/ksher)](https://pypi.org/project/ksher/)

Python: https://github.com/ksher-api/ksher_sdk_python

Go: https://github.com/ksher-api/ksher-sdk/tree/master/go

PHP: https://github.com/ksher-api/ksher-sdk/tree/master/php

Netcore: https://github.com/ksher-api/ksher-sdk/tree/master/netcore

[![Version](https://img.shields.io/npm/v/@kshersolution/ksher)](https://www.npmjs.com/package/@kshersolution/ksher)

NodeJs: https://github.com/ksher-api/ksher_sdk_nodejs


## How to install SDK

Install nodejs on you computer.

Check your nodejs working with your computer by using

```shell
node -v
```

Install ksher SDK by 

```shell
npm install @kshersolution/ksher
```
or clone from

```shell
git clone https://github.com/ksher-solutions/ksher_sdk_nodejs
```

## using SDK

Initial data to call

```nodejs
const appid = "mch35000";  // setup your appid at here
const path = "/Users/example/ksher_sdk_nodejs/Mch35000_PrivateKey.pem"; // setup your private key path at here

const KsherPay = require('@kshersolution/ksher');
const sdk = new KsherPay(appid, path)
```
alternative way you can read your private key from string

```nodejs
const appid = "mch35000";  // setup your appid at here
const privatekey =`-----BEGIN RSA PRIVATE KEY-----
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx
-----END RSA PRIVATE KEY-----
`;
// setup your private key data inside pem file at here

const KsherPay = require('@kshersolution/ksher');
const sdk = new KsherPay(appid, privatekey)
```

## Website

Please see http://api.ksher.net/KsherAPI/dev/apis/website.html for more information.

### create website request
```nodejs
const mch_order_no = Date.now().toString();
const gateway_payRequestData = {   
  "mch_order_no": mch_order_no,
  "total_fee": "100",
  "fee_type": "THB",
  "mch_code": mch_order_no,
  "refer_url": "https://www.google.com",
  "mch_redirect_url":"https://www.google.com/api/gateway_pay/success",
  "mch_redirect_url_fail":"https://www.google.comapi/gateway_pay/fail",
  "mch_notify_url":"https://www.google.com/api/gateway_pay/notify_url/",
  "product_name": mch_order_no,
  "channel_list":"promptpay,linepay,airpay,truemoney,atome,card,ktc_instal,kbank_instal,kcc_instal,kfc_instal,scb_easy,bbl_deeplink,baybank_deeplink,kplus,alipay,wechat,card,ktc_instal,kbank_instal,kcc_instal,kfc_instal",
  "lang":"en"
};
await sdk.gateway_pay(gateway_payRequestData)
  .then(response => {
    console.log("body: ",response);
  });
.catch(error => {
    console.log(error);
  });
```
### query status

```nodejs
const mch_order_no = "your create mch_order_no";
const gateway_order_queryData = {   
  "mch_order_no": mch_order_no
};

await sdk.gateway_order_query(gateway_order_queryData)
  .then(response => {
    console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```

## C scan B

### Create Dynamic QR
Please see http://api.ksher.net/KsherAPI/dev/apis/kiosk_c_scan_b.html for more information.
```nodejs
const mch_order_no = Date.now().toString();
const native_payRequestData = {
      mch_order_no: mch_order_no,
      total_fee: "100",
      fee_type:"THB",
      channel: "promptpay"
  };

await sdk.native_pay(native_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```

### query status

```nodejs
const mch_order_no = "your create mch_order_no";
const native_payQueryData = {
    mch_order_no: "2023-02-19-17-34-00",
  };

await sdk.order_query(native_payQueryData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```

## B scan C

### Create Payment order
Please see https://api.ksher.net/KsherAPI/dev/apis/pos_b_scan_c.html for more information.
```nodejs
const mch_order_no = Date.now().toString();
const quick_payRequestData = {
          mch_order_no: mch_order_no,
          total_fee: "100",
          fee_type:"THB",
          channel: "truemoney",
          auth_code: "111111111111111111"
      };

await sdk.quick_pay(quick_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```
### query status

```nodejs
const mch_order_no = "your create mch_order_no";
const quick_payQueryData = {
    mch_order_no: "2023-02-19-17-34-00",
  };

await sdk.order_query(quick_payQueryData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```

## Application

### Create Payment order
Please see https://api.ksher.net/KsherAPI/dev/apis/mobile_app.html for more information.
```nodejs
const mch_order_no = Date.now().toString();
const app_payRequestData = {
              mch_order_no: mch_order_no,
              total_fee: "100",
              fee_type:"THB",
              channel: "wechat",
              product_name: "some product",
              refer_url: "http://www.google.com",
              notify_url: "https://your_notify_url.com/notify",
              mch_order_no: "3500114305",
              local_total_fee: 10000,
              channel_sub_appid: "wxxxxxxxxxxxx",
          };

await sdk.app_pay(app_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```
### query status

```nodejs
const mch_order_no = "your create mch_order_no";
const app_payRequestData = {
    mch_order_no: "2023-02-19-17-34-00",
  };

await sdk.order_query(app_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```

## Mini Program

### Create Payment order
Please see https://api.ksher.net/KsherAPI/dev/apis/wechat_mini_pro.html for more information.
```nodejs
const mch_order_no = Date.now().toString();
const mini_program_payRequestData = {
              mch_order_no: mch_order_no,
              total_fee: "100",
              fee_type:"THB",
              channel: "wechat",
              product_name: "some product",
              refer_url: "http://www.google.com",
              notify_url: "https://your_notify_url.com/notify",
              mch_order_no: "3500114305",
              local_total_fee: 10000,
              channel_sub_appid: "wx8888888888888888",
              sub_openid: "oUpF8uMuAJO_M2pxb1Q9zNjWeS6o",
          };

await sdk.mini_program_pay(mini_program_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```
### query status

```nodejs
const mch_order_no = "your create mch_order_no";
const app_payRequestData = {
    mch_order_no: "2023-02-19-17-34-00",
  };

await sdk.order_query(app_payRequestData)
.then(response => {
  console.log("body: ",response);
});
.catch(error => {
  console.log(error);
});
```
