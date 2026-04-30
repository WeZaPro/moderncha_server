const KsherPay = require('../src/sdk')
appid = "mch35005";
const fs = require("fs");

privatekey =`-----BEGIN RSA PRIVATE KEY-----
MIIBOgIBAAJBAMhFg7PoOgSvUWzfTv4xerdNRc0lZMGTh71dV3g0d4GEO88tOlph
LTPVnBGVvpvFvhYDgDQqWtGIm8NIHopQDJsCAwEAAQJADYmVY33ZHiPzrxZRMqGJ
mAZjJ4DVlLgyPrymgvuY8GovDisXC/4Oo2JCwGJLJEiYWvWJqkLIMnMfF9Mj6pEx
oQIhAPxbrlTCZsoxIXoftfA79EoXpPyJnQ26C4dcbkxQOAWZAiEAyylnP8uxMOIP
MsgXT1LF+WTGfw4JZyQCmJDKlIbFnFMCIHU6caVWGUHbyN1eVbofX7/7c90MYDS8
NBbRTTuOGDghAiEAoN2u4Kf0LOXC7Q3czzWWhyxRtEc0ENRFrfJwRf0VOfsCIFwg
IATE8U+GHPfygz0oBJwLfPaOAIdxup1x38UswEl/
-----END RSA PRIVATE KEY-----`;
//mockup private key verify sign use public key

describe('verifySignature', () => {

    test('exampleGatewaypayDataResponse', () => {
        const sdk = new KsherPay(appid, privatekey)
        const exampleGatewaypayDataResponse = {
          code: 0,
          msg: 'SUCCESS',
          data: {
            pay_content: 'https://gateway.ksher.com/ua?order_uuid=f624f098b8d111edacef525400962f26&lang=en'
          },
          sign: '7b2159b7f2ec4bff350322b5cdef55bfe4265c03023390ccf8e98292c559a29d79c34ad2eaceaeb5b7d5c6ab9e13afb8c85b0bf267046ea0c5b3d24bf53c09d6',
          message: 'SUCCESS'
        }
        const verifySignature = sdk.verifySignature(exampleGatewaypayDataResponse);
        // console.log("verify Signature: ",verifySignature);
        expect(verifySignature).toBe(true);
      });

    test('verifySignature_exampleGateway_order_queryDataResponse', () => {
        const sdk = new KsherPay(appid, privatekey);
        const exampleGateway_order_queryDataResponse = {
          code: 0,
          msg: '操作成功',
          data: {
            channel: '',
            openid: '',
            channel_order_no: '',
            cash_fee_type: '',
            ksher_order_no: '',
            nonce_str: '',
            time_end: '',
            fee_type: 'THB',
            attach: '',
            rate: '',
            result: 'NOTSURE',
            total_fee: 100,
            appid: 'mch35005',
            cash_fee: '',
            mch_order_no: '2023-02-22-17-11-00',
            pay_mch_order_no: '2303031613445796'
          },
          sign: '7a70f22e35a89e2a792c64a27ed8d43f1376601ea29c1db3c38ad5f09b751d7298013505ecb208496b952257362d27200f7dfbe48b58e688bd0b5cb59e2932b9',
          message: '操作成功'
        };
        const verifySignature = sdk.verifySignature(exampleGateway_order_queryDataResponse);
        // console.log("verify Signature: ",verifySignature);
        expect(verifySignature).toBe(true);
      });
    
        test('verifySignature_exampleNative_payDataResponse', () => {
        const sdk = new KsherPay(appid, privatekey);
        const exampleNative_payDataResponse = {
          code: 0,
          status_code: '',
          status_msg: '',
          sign: '6001c6087bb1e6fc926219d629758d2814a78ae1def4c2611280dcb50c6af8b7078b32b00275b8a4c645d3705794bf766e78bc0366886e1e115620d75227d436',
          version: '3.0.0',
          msg: 'ok',
          time_stamp: '2023-03-03T17:27:54.334710+08:00',
          data: {
            trade_type: 'NATIVE',
            ksher_order_no: '90020230219183454924882',
            mch_order_no: '2023-02-19-17-34-00',
            nonce_str: 'ZvL4zwWReMfkVqxxJS8yKPCdMVbjk6Kk',
            fee_type: 'THB',
            imgdat: 'data:image/png;base64,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',
            result: 'SUCCESS',
            total_fee: 100,
            appid: 'mch35005',
            PaymentID: '90020230219183454924882',
            PaymentCode: '00020101021230750016A0000006770101120115010556019950701022020230219183454924882030890035005530376454041.005802TH63046B6A',
            code_url: '00020101021230750016A0000006770101120115010556019950701022020230219183454924882030890035005530376454041.005802TH63046B6A',
            stalls_name: '90035005',
            device_id: ''
          }
        };
        const verifySignature = sdk.verifySignature(exampleNative_payDataResponse);
        // console.log("verify Signature: ",verifySignature);
        expect(verifySignature).toBe(true);
      });

      test('verifySignature_exampleRefund_queryDataResponse', () => {
        const sdk = new KsherPay(appid, privatekey);
        const exampleRefund_queryDataResponse = {
            code: 0,
            data: {
                appid: "mch29217",
                cash_fee: "48",
                cash_fee_type: "CNY",
                channel_order_no: "4200001823202304219631687916",
                fee_type: "THB",
                ksher_order_no: "70020230421121618509855",
                mch_order_no: "2023042111163700",
                nonce_str: "cffa8e4b4aa98b197cf3ae73968d9c87",
                refund_count: "2",
                refund_fee: "2",
                refund_orders: [
                    {
                        channel_refund_no: "50202405672023042133267207073",
                        ksher_refund_no: "70020230421122235500857",
                        mch_refund_fee: 20,
                        mch_refund_no: "refund1_2023042111163700",
                        refund_state: "REFUNDSUCCESS",
                        refund_time: "2023-04-21 11:22:45"
                    },
                    {
                        channel_refund_no: "50202405672023042133267207108",
                        ksher_refund_no: "70020230421122418652074",
                        mch_refund_fee: 20,
                        mch_refund_no: "refund2_2023042111163700",
                        refund_state: "REFUNDSUCCESS",
                        refund_time: "2023-04-21 11:24:28"
                    }
                ],
                result: "SUCCESS",
                time_end: "2023-04-21 11:22:45",
                total_fee: 200
            },
            msg: "ok",
            sign: "9b8042dc417cc245c83f56e8c34b719cc88ab4420eb1eec351256a31b5f856c948069120600339d89f4252eaf076c265e6be633be1c65cea5e80d49830cc89e5",
            status_code: "",
            status_msg: "",
            time_stamp: "2023-04-21T12:26:56.375672+08:00",
            version: "3.0.0"
        };
        const verifySignature = sdk.verifySignature(exampleRefund_queryDataResponse);
        // console.log("verify Signature: ",verifySignature);
        expect(verifySignature).toBe(true);
      });

  test('verifySignature_exampleMerchant_info_DataResponse', () => {
    const sdk = new KsherPay(appid, privatekey);
    const exampleMerchant_infoDataResponse = {
      code: 0,
      data: {
          account_type: "Formal",
          agency_info: {
              agency_name: "54321@ksher.net",
              mobile: "13823114817"
          },
          allow_partial_refund: "Y",
          allow_remote_pay: "Y",
          bank_info: {
              account_id: "0591073745",
              account_name: "บจก. ไมเนอร์ ไลฟ์สไตล์",
              bank_name: "002,BANGKOK BANK PUBLIC COMPANY LIMITED",
              swift_code: "BKKBTHBK"
          },
          bd_info: {
              bd_name: "vicky",
              mobile: "13031028803"
          },
          business_address_code: "12448",
          business_mode: "online",
          city_name_cn: "曼谷",
          city_name_en: "Bangkok",
          city_name_th: "กรุงเทพมหานคร",
          contact: "3",
          country_info: {
              country_name: "Thailand",
              phone_code: "+66"
          },
          country_support_channel: [
              "wechat",
              "alipay",
              "promptpay",
              "truemoney",
              "airpay",
              "linepay",
              "card",
              "alipayplus",
              "ktc_instal",
              "kbank_instal",
              "scb_instal",
              "bbl_deeplink",
              "scb_easy",
              "bbl_ibs",
              "kplus",
              "baybank_deeplink",
              "atome",
              "payout",
              "kfc_instal",
              "kcc_instal"
          ],
          extra_info: {},
          has_open_use_coupon: "N",
          is_master_mch: "N",
          logo_url: "https://file.ksher.cn/ksherbd/h5/202124/15182.png",
          master_mch_id: "28621",
          mch_appid: "mch29217",
          mch_id: "29217",
          mch_name: {
              mch_brief_name: "sakura010_1*2(3)4,5.6&78中国北京",
              merchant_name: "MINOR_en"
          },
          mch_notify_url: "",
          mch_support_channel: [
              {
                  day_sum_limit: -1,
                  pay_channel: "alipay",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "payout",
                  settlement_time_type: "T+3",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "kcc_instal",
                  settlement_time_type: "T+5",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "baybank_deeplink",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "airpay",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "kbank_instal",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "bbl_ibs",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "scb_easy",
                  settlement_time_type: "T+2",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "wechat",
                  settlement_time_type: "T+2",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "bbl_deeplink",
                  settlement_time_type: "T+2",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "kplus",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "kfc_instal",
                  settlement_time_type: "T+5",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "card",
                  settlement_time_type: "T+1",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "atome",
                  settlement_time_type: "T+3",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "promptpay",
                  settlement_time_type: "T+2",
                  single_order_limit: -1
              },
              {
                  day_sum_limit: -1,
                  pay_channel: "truemoney",
                  settlement_time_type: "T+2",
                  single_order_limit: -1
              }
          ],
          merchant_type: "Corporation",
          mobile: "0917804190",
          nonce_str: "90878866ae158dbec56351fd463c2717",
          operator_list: [
              {
                  add_time: "2021-04-27 15:21:22",
                  mch_id: "29217",
                  operator: "QWui",
                  operator_id: "14440",
                  rule_id: "0",
                  state: "1"
              },
              {
                  add_time: "2021-07-07 14:41:17",
                  mch_id: "29217",
                  operator: "收银",
                  operator_id: "14748",
                  rule_id: "1",
                  state: "1"
              }
          ],
          price_fee_type: "THB",
          rigist_time: "2021-04-27 14:20:28",
          settlement_fee_type: "THB",
          time_zone: "+07:00",
          wht: 1
      },
      msg: "ok",
      sign: "0b212f66aa7056d33e74f198948dc07b4df29e362cf0ced38be153255d4f13b9f881075f9728f81b65d3b9797b02598c0a42cdd1b576dcaa456c17f176e21ee2",
      status_code: "",
      status_msg: "",
      time_stamp: "2023-08-16T17:04:11.566556+08:00",
      version: "3.0.0"
  };
    const verifySignature = sdk.verifySignature(exampleMerchant_infoDataResponse);
    // console.log("verify Signature: ",verifySignature);
    expect(verifySignature).toBe(true);
  });
  
});