# Where'sMyPhone

## Get Where'sMyPhone on your Alexa-enabled device [here](https://www.amazon.com/Jesse-Friedman-WheresMyPhone/dp/B01M6AFH5L/)!

**Ever lose your phone in your own house/apartment? Under a cushion, in the bathroom, in the microwave...**

Ok, maybe that last one's just me. In any case, the time-honored human tradition of asking your friend to call your phone so you can find it seems out-of-place in this advanced world we live in. In 2016, who needs a human friend - we have Alexa!

Where'sMyPhone integrates your Alexa-enabled device with the Twilio Voice API, reducing the task of locating your phone to less than ten words, spoken to the small black cylinder on your shelf. Isn't it great living in the future?

## How to use this code

The two Lambda functions in this repository are managed with the [Apex](https://github.com/apex/apex) tool - you should install the tool if you want to deploy the functions on your own account.

Where'sMyPhone relies on a DynamoDB database called WheresMyPhoneUsers to store user data. You should create a database with this name in your own account and make sure both Lambda functions can read and write to it.

The `apigateway-spec.json` file consists of the API Gateway used for the *caller* function to serve TwiML, exported from the API Gateway console. You can import this file into your own console to replicate the same functionality.

You will need a Twilio account and phone number to use this code. Enter your Twilio information and your API Gateway URL in the `config-example.json` file in the *caller* function, and rename this file to `config.json`.

## TODO

- [ ] Add support for multiple phone numbers per user
- [ ] Re-record voice lines (I think they could use a little work.)
