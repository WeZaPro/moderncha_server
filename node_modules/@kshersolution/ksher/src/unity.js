const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
var qs = require("qs");
const { type } = require("os");

class Unity {
  static generateRandomString(length) {
    const characters =
      "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
    let result = "";
    for (let i = 0; i < length; i++) {
      result += characters.charAt(
        Math.floor(Math.random() * characters.length)
      );
    }
    return result;
  }
  static sort_keys(data) {
    const obj = {};
    Object.keys(data)
      .sort()
      .forEach((key) => {
        if (key !== "sign") {
          if (typeof data[key] == "string" || typeof data[key] == "number") {
            obj[key] = data[key];
          } else if (data[key] instanceof Buffer) {
            obj[key] = data[key].toString("utf-8");
          } else if (data[key].constructor == Array) {
            const alist = [];
            data[key].forEach((unsort_key) => {
              var sort_key = this.sort_keys(unsort_key);
              alist.push(sort_key);
            });
            obj[key] = alist;
          } else if (data[key].constructor == Object) {
            obj[key] = Object.keys(data[key]).sort();
          } else {
            obj[key] = data[key];
          }
        }
      });
    return obj;
  }
  static convertData2Str(data) {
    const obj = this.sort_keys(data);

    const alist = [];
    for (const [key, value] of Object.entries(obj)) {
      let strval = "";
      let keystr = key;

      if (typeof value === "string") {
        strval = value;
      } else if (value instanceof Buffer) {
        strval = value.toString("utf-8");
      } else {
        strval = JSON.stringify(value, null, 0);
      }
      // console.log(keystr + '=' + strval);
      alist.push(keystr + "=" + strval);
    }
    alist.sort();
    const predata = alist.join("");
    // console.log('string make signature: ', predata);
    return predata;
  }

  static isPrivateKeyPEMFormat(encryptedText) {
    try {
      const privateKey = crypto.createPrivateKey(encryptedText);
      return privateKey.asymmetricKeyType === "rsa";
    } catch (error) {
      return false;
    }
  }
}

module.exports = Unity;
