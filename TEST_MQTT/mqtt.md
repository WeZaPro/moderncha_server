mosquitto_sub -h broker.hivemq.com -p 1883 \
-t esp32/dev123/esp32-E04775D4DB1C/cmd -v

mosquitto_pub -h broker.hivemq.com -p 1883 \
-t esp32/dev123/esp32-E04775D4DB1C/income \
-q 1 \
-m '{
"cmd":"save-income",
"deviceId":"esp32-E04775D4DB1C",
"machineSystem":"CATCARWASH",
"orderId":"TEST_MAC_004",
"cashIncome":0,
"coinIncome":0,
"qrIncome":555,
"sumIncome":50,
"lastMoney":50
}'

mosquitto_pub -h broker.hivemq.com -p 1883 \
-t esp32/dev123/esp32-1CDBD477FA84/income \
-q 1 \
-m '{
"cmd":"save-income",
"deviceId":"esp32-E04775D4DB1C",
"machineSystem":"CATPAW-SHOE",
"orderId":"TEST_MAC_001",
"cashIncome":0,
"coinIncome":999,
"qrIncome":50,
"sumIncome":50,
"lastMoney":50
}'

mosquitto_pub -h broker.hivemq.com -p 1883 \
-t esp32/dev123/esp32-1CDBD477FA84/income \
-q 1 \
-m '{
"cmd":"save-income",
"deviceId":"esp32-1CDBD477FA843",
"machineSystem":"CATPAW-HELMET",
"orderId":"TEST_MAC_001",
"cashIncome":0,
"coinIncome":0,
"qrIncome":50,
"sumIncome":50,
"lastMoney":50
}'

mosquitto_pub -h broker.hivemq.com -p 1883 \
-t esp32/dev123/esp32-1CDBD477FA84/income \
-q 1 \
-m '{
"cmd":"save-income",
"deviceId":"esp32-1CDBD477FA843",
"machineSystem":"TESTING",
"orderId":"TEST_MAC_002",
"cashIncome":0,
"coinIncome":0,
"qrIncome":50,
"sumIncome":50,
"lastMoney":50
}'
