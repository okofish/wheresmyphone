var alexa = require('alexa-app');
var AWS = require('aws-sdk');
var Analytics = require('analytics-node');

var dynamodb = new AWS.DynamoDB.DocumentClient();
var lambda = new AWS.Lambda();
if (process.env['SEGMENT_KEY']) {
  var analytics = new Analytics(process.env['SEGMENT_KEY'], {
    flushAt: 1
  });
} else {
  // this makes a dummy analytics object
  var analytics = {
    identify: new Function(),
    track: new Function()
  }
}

var app = new alexa.app('Where\'sMyPhone');

app.pre = function(request, response, type) {
  analytics.identify({
    userId: request.sessionDetails.userId
  });
  analytics.track({
    userId: request.sessionDetails.userId,
    event: 'Intent Request',
    properties: {
      sessionId: request.sessionDetails.sessionId,
      type: type,
      intent: type === 'IntentRequest' ? request.data.request.intent.name : undefined
    }
  });
}

app.intent('CallIntent', {
  slots: {},
  utterances: ['{call|find|where\'s} {my|the} phone{ again|}', '{call|find} it{ again|}']
}, function(request, response) {
  checkForNumber(request.sessionDetails.userId, function(userRecord) {
    if (userRecord) {
      if (userRecord.verified === true) {
        analytics.track({
          userId: request.sessionDetails.userId,
          event: 'Call Request',
          properties: {
            sessionId: request.sessionDetails.sessionId,
            type: 'successful'
          }
        });
        callNumber('call', {
          number: userRecord.number,
          userId: userRecord.userId,
          sessionId: request.sessionDetails.sessionId
        }, function() {
          response.say('Calling your phone now.');
          response.send();
        });
      } else {
        analytics.track({
          userId: request.sessionDetails.userId,
          event: 'Call Request',
          properties: {
            sessionId: request.sessionDetails.sessionId,
            type: 'unverified'
          }
        });
        response.say('It looks like your number <say-as interpret-as="telephone">' + userRecord.number + '</say-as> hasn\'t been verified yet.');
        response.say('Would you like to re-send the verification call, or change the number?');
        response.reprompt('Would you like to re-send the verification call, or change the number?');
        response.shouldEndSession(false);

        response.session('state', 'ResendVerificationCallQuery');
        response.session('number', userRecord.number);
        response.send();
      }
    } else {
      analytics.track({
        userId: request.sessionDetails.userId,
        event: 'Call Request',
        properties: {
          sessionId: request.sessionDetails.sessionId,
          type: 'unset'
        }
      });
      response.say('It looks like you don\'t have a phone number set.');
      response.say('Would you like to set your phone number?');
      response.reprompt('Would you like to set your phone number?');
      response.shouldEndSession(false);
      response.session('state', 'SetPhoneNumberQuery');
      response.send();
    }
  });

  return false;
});

app.intent('AMAZON.YesIntent', {
  utterances: ['yes it is', 'yes they are']
}, function(request, response) {
  if (request.session('state') === 'SetPhoneNumberQuery') {
    response.say('Please dictate the ten digits of your phone number.');
    response.reprompt('Please dictate the ten digits of your phone number.');
    response.shouldEndSession(false);
    response.session('state', 'PhoneNumberQuery');
    response.session('number', null);
  } else if (request.session('state') === 'VerifyHeardNumberQuery') {
    var number = parseInt(request.session('number'));

    analytics.track({
      userId: request.sessionDetails.userId,
      event: 'Number Entry',
      properties: {
        sessionId: request.sessionDetails.sessionId,
        type: 'correct',
        numberLength: request.session('number').toString().length,
        numberFirstDigit: request.session('number').toString()[0]
      }
    });
    response.session('state', null);
    response.session('number', null);
    addNumber(request.sessionDetails.userId, number, function() {
      callNumber('verify', {
        number: number,
        userId: request.sessionDetails.userId,
        sessionId: request.sessionDetails.sessionId
      }, function() {
        response.say('OK, I\'ve sent a verification call to that number.');
        response.send();
      });
    });

    return false
  } else {
    response.say('I\'m not sure what you meant.');
    response.session('state', null);
  }
});

app.intent('AMAZON.NoIntent', {
  utterances: ['{do |}neither', 'don\'t do anything']
}, function(request, response) {
  if (request.session('state') === 'VerifyHeardNumberQuery') {
    analytics.track({
      userId: request.sessionDetails.userId,
      event: 'Number Entry',
      properties: {
        sessionId: request.sessionDetails.sessionId,
        type: 'misheard',
        numberLength: request.session('number').toString().length,
        numberFirstDigit: request.session('number').toString()[0]
      }
    });

    response.say('Please dictate the ten digits of your phone number.');
    response.reprompt('Please dictate the ten digits of your phone number.');
    response.shouldEndSession(false);
    response.session('state', 'PhoneNumberQuery')
  } else {
    response.say('OK.');
    response.session('number', null);
    response.session('state', null);
  }
});

app.intent('AMAZON.CancelIntent', function(request, response) {
  response.say('OK.');
  response.session('number', null);
  response.session('state', null);
});

app.intent('AMAZON.StopIntent', function(request, response) {
  response.say('OK.');
  response.session('number', null);
  response.session('state', null);
});

app.intent('SetPhoneNumberIntent', {
  slots: {},
  utterances: ['{set|change} {my|the} {phone |}number', '{set|change} it']
}, function(request, response) {
  response.say('Please dictate the ten digits of your phone number.');
  response.reprompt('Please dictate the ten digits of your phone number.');
  response.shouldEndSession(false);
  response.session('state', 'PhoneNumberQuery');
  response.session('number', null);
});

app.intent('PhoneNumberIntent', {
  slots: {
    'PhoneNumber': 'NUMBER'
  },
  utterances: ['{-|PhoneNumber}']
}, function(request, response) {
  response.session('state', null);
  if (request.session('state') === 'PhoneNumberQuery') {
    if (request.slot('PhoneNumber').trim().length === 10) {
      var number = parseInt(request.slot('PhoneNumber'));

      response.say('I heard, <say-as interpret-as="telephone">' + number + '</say-as>. Is this correct?');
      response.reprompt('I heard, <say-as interpret-as="telephone">' + number + '</say-as>. Is this correct?');
      response.shouldEndSession(false);
      response.session('state', 'VerifyHeardNumberQuery');
      response.session('number', number);
    } else {
      analytics.track({
        userId: request.sessionDetails.userId,
        event: 'Number Entry',
        properties: {
          sessionId: request.sessionDetails.sessionId,
          type: 'invalid',
          numberLength: request.slot('PhoneNumber').trim().length,
          numberFirstDigit: request.slot('PhoneNumber').trim()[0]
        }
      });
      response.say(app.name + ' only supports 10-digit North American Numbering Plan phone numbers. Please dictate the ten digits of your phone number.');
      response.reprompt('Please dictate the ten digits of your phone number.');
      response.shouldEndSession(false);
      response.session('state', 'PhoneNumberQuery');
      response.session('number', null);
    }
  } else {
    response.say('I\'m not sure what you meant.');
  }
});

app.intent('ResendVerificationCallIntent', {
  slots: {},
  utterances: ['{resend|re-send} the {verification |}call', '{resend|re-send|reverify|re-verify|verify} {it|}']
}, function(request, response) {
  response.session('state', null);
  response.session('number', null);
  if (request.session('state') === 'ResendVerificationCallQuery' && request.session('number')) {
    var number = parseInt(request.session('number'));

    callNumber('verify', {
      number: number,
      userId: request.sessionDetails.userId,
      sessionId: request.sessionDetails.sessionId
    }, function() {
      response.say('OK, re-sending the verification call now.');
      response.send();
    });
  } else {
    response.say('I\'m not sure what you meant.');
    response.send();
  }

  return false
});

app.intent('AMAZON.HelpIntent', {
  utterances: ['help {me |}{find|call} {my |}phone']
}, function(request, response) {
  response.say('You can ask me to call your phone or change your phone number. What would you like ' + app.name + ' to do?');
  response.shouldEndSession(false);
  response.reprompt('What would you like ' + app.name + ' to do?');
});

app.launch(function(request, response) {
  response.say('Welcome to ' + app.name + '.');

  checkForNumber(request.sessionDetails.userId, function(userRecord) {
    if (userRecord) {
      analytics.track({
        userId: request.sessionDetails.userId,
        event: 'Skill Launch',
        properties: {
          sessionId: request.sessionDetails.sessionId,
          type: 'successful'
        }
      });
      response.say('Would you like me to call your phone, or change your phone number?');
      response.reprompt('Would you like me to call your phone, or change your phone number?');
    } else {
      response.say('It looks like you don\'t have a phone number set.');
      response.say('Would you like to set your phone number?');
      response.reprompt('Would you like to set your phone number?');
      response.session('state', 'SetPhoneNumberQuery');
    }

    response.shouldEndSession(false);
    response.send();
  })

  return false
});

//TODO: turn all these callbacks into promises!
function checkForNumber(userId, cb) {
  dynamodb.get({
    TableName: 'WheresMyPhoneUsers',
    Key: {
      userId: userId
    }
  }).promise().then(function(data) {
    if (data.hasOwnProperty('Item')) {
      cb(data.Item);
    } else {
      cb();
    }
  }).catch(function(err) {
    console.error(err);
  })
}

function addNumber(userId, number, cb) {
  dynamodb.put({
    TableName: 'WheresMyPhoneUsers',
    Item: {
      userId: userId,
      number: number,
      verified: false
    }
  }).promise().then(cb).catch(function(err) {
    console.error(err);
  })
}

function callNumber(type, opts, cb) {
  analytics.track({
    userId: opts.userId,
    event: 'Call',
    properties: {
      sessionId: opts.sessionId,
      type: type
    }
  });
  lambda.invoke({
    FunctionName: 'alexa-wheresmyphone_caller',
    InvocationType: 'Event',
    Payload: JSON.stringify({
      type: type,
      number: opts.number,
      userId: opts.userId
    })
  }).promise().then(cb).catch(function(err) {
    console.error(err);
  })
}

// Checking if we're actually being run as a module (in this case, as a Lambda function.)
if (module.parent) {
  exports.handle = app.lambda();
} else {
  var fs = require('fs');
  fs.writeFileSync('schema.json', app.schema());
  fs.writeFileSync('utterances.txt', app.utterances());
  console.log('Schema and utterances exported!')
}
