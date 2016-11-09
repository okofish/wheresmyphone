var config = require('./config.json');
var Twilio = require('twilio');
var AWS = require('aws-sdk');

var dynamodb = new AWS.DynamoDB.DocumentClient();
var twilio = Twilio(config.ACCOUNT_SID, config.AUTH_TOKEN);

var useAudio = true;

exports.handle = function(event, context, cb) {
  if (event.hasOwnProperty('body-json')) {
    // we're being called for twiml from twilio
    var resp = new Twilio.TwimlResponse();
    var type = event.params.querystring.type || 'call';
    var userId = event.params.querystring.userId;
    var body = event['body-json'];
    
    //TODO: make this origin checking a bit more robust
    if (body.AccountSid === config.ACCOUNT_SID) {
      if (type === 'call') {
        sayLine(resp, 'locator-intro');
      
        resp.gather({
          action: config.TWIML_URL + '?type=unverify&userId=' + userId,
          finishOnKey: '',
          numDigits: 1
        }, function() {
          sayLine(this, 'locator-optout');
        });
      
        sayLine(resp, 'goodbye');
      
        resp.hangup();
      } else if (type === 'verify') {
        sayLine(resp, 'verification-intro');
      
        resp.gather({
          action: config.TWIML_URL + '?type=verifyconfirm&userId=' + userId,
          finishOnKey: '',
          timeout: 10,
          numDigits: 1
        }, function() {
          sayLine(this, 'verification-choice');
        });
      
        sayLine(resp, 'goodbye');
      
        resp.hangup();
      } else if (type === 'unverify') {
        if (body.Digits === '1') {
          var number = parseInt(body.Called.slice(2));
          removeNumber(userId).catch(function(err) {
            console.error(err);
          });
        
          sayLine(resp, 'optout-complete');
        
          resp.hangup();
        } else {
          resp.gather({
            action: config.TWIML_URL + '?type=unverify&userId=' + userId,
            finishOnKey: '',
            numDigits: 1
          }, function() {
            sayLine(this, 'locator-optout');
          });
        
          sayLine(resp, 'goodbye');
        
          resp.hangup();
        }
      } else if (type === 'verifyconfirm') {
        var number = parseInt(body.Called.slice(2));
        if (body.Digits === '1') {
          verifyNumber(userId).catch(function(err) {
            console.error(err);
          });
        
          sayLine(resp, 'verification-complete');
        
          resp.hangup();
        } else {
          removeNumber(userId).catch(function(err) {
            console.error(err);
          });
        
          sayLine(resp, 'optout-complete');
        
          resp.hangup();
        }
      } else if (type === 'incoming') {
        resp.play(config.AUDIO_BASE + 'incoming.mp3');
        resp.hangup();
      }
    } else {
      resp.say('Invalid account SID.');
    }

    cb(null, resp.toString());
  } else {
    // we're being invoked from the skill
    //TODO: consider moving this to the skill function
    twilio.makeCall({
      to: '+1' + event.number,
      from: config.NUMBER,
      url: config.TWIML_URL + '?type=' + event.type + '&userId=' + event.userId
    }, function(err, responseData) {
      cb();
    });
  }
}

function verifyNumber(userId) {
  return dynamodb.update({
    TableName: 'WheresMyPhoneUsers',
    Key: {
      userId: userId
    },
    UpdateExpression: 'set #key = :value',
    ExpressionAttributeNames: {
      '#key': 'verified'
    },
    ExpressionAttributeValues: {
      ':value': true
    }
  }).promise();
}

function removeNumber(userId) {
  return dynamodb.delete({
    TableName: 'WheresMyPhoneUsers',
    Key: {
      userId: userId
    }
  }).promise();
}

function sayLine(resp, line) {
  var lines = {
    'locator-intro': 'This is an automated call from the Where\'s My Phone Alexa skill.',
    'locator-optout': 'If you do not wish to receive calls like this in the future, press one.',
    'verification-intro': 'This is an automated verification call from the Where\'s My Phone Alexa skill.',
    'verification-choice': 'To verify ownership of this phone number, press one. If you have received this call in error or do not wish to enable this number in the Where\'s My Phone skill, press two or hang up.',
    'verification-complete': 'Your number is now verified. Goodbye.',
    'optout-complete': 'Your number has been removed from our database. We apologize for any inconvenience. Goodbye.',
    'goodbye': 'Goodbye.'
  }
  
  if (useAudio === true) {
    resp.play(config.AUDIO_BASE + line + '.wav');
  } else {
    resp.say(lines[line]);
  }
}