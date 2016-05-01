var _ = require('underscore')
var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var md5 = require('md5')
var api = require('marvel-api')
var Wit = require('node-wit').Wit;
var app = express()
var token = "EAAYJpbaJfuUBAGrHv5892ANU1ER1ZBzqIpK0xnG5ZBKkdSQqSpNaFRjp8diPAfYLWoYpL3VyakXsOa1aHczQZCJ3BZCuSt8kKzQfUpnADSVhxzuZCBElw1MS4e9t9qk9jS8ZAV4wrZAQUppbsAc7FRcpA4QP1Czz0vdRGvSbGWukAZDZD"
var public_key = '9aaf771e2b960537d98d91ff2451b2d6'
var private_key = 'aba10e9f584d245bd51f13a9ce8111d142f27d00'
var witToken = "2QN2FH6KBYEISQHLJOA6AAQ7PC3VQPF5"
var marvel = api.createClient({
    publicKey: public_key,
    privateKey: private_key
});
var Postmates = require('postmates');
var postmates = new Postmates('cus_KOQ26V1V9K3Zkk', 'ef65a92b-aec4-4147-94b2-8e106ca7c39f');

const actions = {
	say(sessionId, context, message, cb) {
		console.log(message);
		cb();
	},
	merge(sessionId, context, entities, message, cb) {
		cb(context);
	},
	error(sessionId, context, error) {
		console.log(error.message);
	},	
}

const client = new Wit(witToken, actions);

app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

app.use(express.static('frontend'))

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'marvel_la_hacks') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong token')
})

// Spin up the server
app.listen(app.get('port'), function() {
    console.log('running on port', app.get('port'))
})


app.post('/webhook/', function (req, res) {
    messaging_events = req.body.entry[0].messaging
    for (i = 0; i < messaging_events.length; i++) {
        event = req.body.entry[0].messaging[i]
        sender = event.sender.id
        if (event.message && event.message.text) {
            text = event.message.text
			client.message(text, function (error, data) {
                if (error) {
                    // Wit could not parse the string
                    return
                } 
                console.log('Yay, got Wit.ai response: ' + JSON.stringify(data));
                var entities = data.outcomes[0].entities;
                var skipEntities = false;
                if (_.has(entities, 'intent') && entities.intent[0].value === "hungry") {
                    hungry(sender);
                    return;
                }
                if (!_.has(entities, 'intent') && _.has(entities, 'object')) {
                    var funcToRun = searchForGeneric
                    skipEntities = true; 
                }
                if (!_.has(entities, 'object')) {
                    unableToParse();
                    return;
                }
                var searchTerm = entities.object[0].value
                if (!skipEntities) {
                    switch(entities.intent[0].value) {
                    case "search_comic":
                        var funcToRun = searchForComic
                        break;
                    case "search_character":
                        var funcToRun = searchForCharacterByQuery
                        break;
                    case "search_event":
                        var funcToRun = searchForEvent
                        break;
                    case "search_generic":
                        var funcToRun = searchForGeneric
                        break;
                    case "search_comics_for_character":
                        var funcToRun = getComicsForCharacter
                        break;
                    case "help":
                        var helpText = "Type in a question about the Marvel Universe to get started!\nFor example, you can try asking \"Who is Iron Man?\""
                        sendTextMessage(sender, helpText)
                        return;
                    default:
                        break;
                    }
                }
                funcToRun(searchTerm, sender);
            });
        }
    }
    if(event.postback) {
        text = JSON.stringify(event.postback);
        console.log(text)
        var numb = text.match(/\d/g);
        numb = numb.join("");
        var payload = text.substring(12, text.indexOf(":", 11))
        console.log(payload)
        if (payload == "comics_for_character_id") {
            searchForComic("", sender, numb)
        } else if (payload == "comics_for_event_id") {
            searchComicsByEvent(number, sender)
        } else if (payload == "characters_for_event_id") {
            searchForCharacterByEvent(numb, sender)
        }
        
    }
    res.sendStatus(200)
})

function searchForCharacterByQuery(search, sender) {
    marvel.characters.findNameStartsWith(search).then(extractCharacterInfo)
}

function searchForCharacterByEvent(id, sender) {
    marvel.events.characters(id).then(extractCharacterInfo)
}

function getCharacterId(query) {
    marvel.characters.findNameStartsWith(query).then(function(res) {
        var count = res.meta.count
        if (count == 0) {
            return "-1"
        }
        return res.data[0].id
    })
}

function getComicsForCharacter(query, sender) {
    marvel.characters.findNameStartsWith(query).then(function(res) {
        var count = res.meta.count
        if (count == 0) {
            return "-1"
        }
        searchForComic("", sender, res.data[0].id)
    })
}

function extractCharacterInfo(res) {
    var data = res.data
    var count = res.meta.count
    var names = []
    var ids = []
    var descriptions = []
    var thumbnails = []
    var detailsUrls = []
    var comicLinkUrls = []
    count = Math.min(10, res.meta.count) //Can only show a max of 10 items
    for(i = 0; i < count; i++) {
        var item = data[i]
        var id = item.id
        var name = item.name
        var description = item.description
        var thumbnailUrl = item.thumbnail.path + "." + item.thumbnail.extension
        var urls = item.urls
        var detailsUrl = null
        var comicLinkUrl = null
        for (j = 0; j < urls.length; j++) {
            var object = urls[j]
            if (object.type == "detail") {
                detailsUrl = object.url
            } else if (object.type == "comiclink") {
                comicLinkUrl = object.url
            }
        }
        ids.push(id)
        names.push(name)
        descriptions.push(description)
        thumbnails.push(thumbnailUrl)
        detailsUrls.push(detailsUrl)
        comicLinkUrls.push(comicLinkUrl)
    }
    sendCharacterMessage(sender, names, descriptions, thumbnails, detailsUrls, comicLinkUrls, ids)
}

function extractComicInfo(res) {
    console.log("entered extract ComicInfo")
    var data = res.data
    var count = res.meta.count
    var titles = []
    var descriptions = []
    var thumbnails = []
    var detailsUrls = []
    var purchaseUrls = []
    var readerUrls = []
    count = Math.min(10, res.meta.count) //Can only show a max of 10 items
    for(i = 0; i < count; i++) {
        console.log("able to enter for loop")
        var item = data[i]
        var title = item.title
        var description = item.description
        var thumbnailUrl = item.thumbnail.path + "." + item.thumbnail.extension
        var urls = item.urls
        var detailsUrl = null
        var purachaseUrl = null
        var readerUrl = null
        for (j = 0; j < urls.length; j++) {
            var object = urls[j]
            if (object.type == "detail") {
                detailsUrl = object.url
                console.log(detailsUrl)
            } else if (object.type == "purchase"){
                purachaseUrl = object.url
            } else if (object.type == "reader") {
                readerUrl = object.url
            }
        }
        titles.push(title)
        descriptions.push(description)
        thumbnails.push(thumbnailUrl)
        detailsUrls.push(detailsUrl)
        purchaseUrls.push(purachaseUrl)
        readerUrls.push(readerUrl)
        console.log(title)
    }
    sendComicMessage(sender, titles, descriptions, thumbnails, detailsUrls, purchaseUrls, readerUrls)
}

function sendComicMessage(sender, names, descriptions, thumbnails, detailsUrls, purchaseUrls, readerUrls) {
    var elements = [] 
    var numCards = names.length
    if (numCards == 0) {
        sendTextMessage(sender, "No results found")
        return;
    }
    for (i = 0; i < numCards; i++) {
        var buttons =  []
        if(detailsUrls[i] != null) {
            var detailsButton = {
                "type": "web_url",
                "url": detailsUrls[i],
                "title": "More Information"
            }
            buttons.push(detailsButton)
        }
        if(purchaseUrls[i] != null) { 
            var purchaseButton = {
                "type": "web_url",
                "url": purchaseUrls[i],
                "title": "Buy Here"
            }
            buttons.push(purchaseButton)
        }
        if(readerUrls[i] != null) {
            var urlButton = {
                "type": "web_url",
                "url": readerUrls[i],
                "title": "Read Online Comic"
            }
            buttons.push(urlButton)
        }
        var card = {
            "title": names[i],
            "subtitle": descriptions[i],
            "image_url": thumbnails[i],
            "buttons": buttons
        }
        elements.push(card)
    }
    messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": elements
            }
        }
    };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}


function searchForComic(search, sender, id) {
    if(search == ""){
        console.log(id)
        console.log("entered searchForComic properly")
    }
    else {
        getComicsForCharacter(search, sender)
        // marvel.comics.
    }
    marvel.characters.comics(id).then(extractComicInfo) 
    console.log("exited searchForComic")
}

function searchComicsByEvent(id, sender) {
    marvel.event.characters(id).then(extractComicInfo)
}

function searchForEvent(search, sender) {
    marvel.events.findNameStartsWith(search).then(function(res) {
        var data = res.data
        var count = res.meta.count
        var titles = []
        var ids = []
        var descriptions = []
        var thumbnails = []
        var detailsUrls = []
        count = Math.min(10, res.meta.count) //Can only show a max of 10 items
        for(i = 0; i < count; i++) {
            var item = data[i]
            var title = item.title
            var id = item.id
            var description = item.description
            var thumbnailUrl = item.thumbnail.path + "." + item.thumbnail.extension
            var urls = item.urls
            var detailsUrl = null
            var wikiLinkUrl = null
            for (j = 0; j < urls.length; j++) {
                var object = urls[j]
                if (object.type == "detail") {
                    detailsUrl = object.url
                }
            }
            titles.push(title)
            ids.push(id)
            descriptions.push(description)
            thumbnails.push(thumbnailUrl)
            detailsUrls.push(detailsUrl)
        }
        sendEventMessage(sender, titles, descriptions, thumbnails, detailsUrls, ids)
    })
}

function searchForGeneric(search, sender) {
    searchForCharacterByQuery(search, sender)
}


function sendCharacterMessage(sender, names, descriptions, thumbnails, detailsUrls, comicLinkUrls, ids) {
    var elements = [] 
    var numCards = names.length
    if (numCards == 0) {
        sendTextMessage(sender, "No results found")
        return;
    }
    for (i = 0; i < numCards; i++) {
        var card = {
            "title": names[i],
            "subtitle": descriptions[i],
            "image_url": thumbnails[i],
            "buttons": [{
                "type": "web_url",
                "url": detailsUrls[i],
                "title": "More Information"
            }, {
                "type": "postback",
                "payload": "comics_for_character_id: " + ids[i].toString(),
                "title": "Related Comics"
            }]
        }
        elements.push(card)
    }
    messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": elements
            }
        }
    };
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

function sendEventMessage(sender, titles, descriptions, thumbnails, detailsUrls, ids) {
    console.log("entered event message")
    var elements = [] 
    var numCards = titles.length
    if (numCards == 0) {
        sendTextMessage(sender, "No results found")
        return;
    }
    for (i = 0; i < numCards; i++) {
        var card = {
            "title": titles[i],
            "subtitle": descriptions[i],
            "image_url": thumbnails[i],
            "buttons": [{
                "type": "web_url",
                "url": detailsUrls[i],
                "title": "More Information"
            }, {
                "type": "postback",
                "payload": "comics_for_event_id: " + ids[i].toString(),
                "title": "Related Comics"
            }, {
                "type": "postback",
                "payload": "characters_for_event_id: " + ids[i].toString(),
                "title": "Related Characters"
            }]
        }
        elements.push(card)
    }
    messageData = {
        "attachment": {
            "type": "template",
            "payload": {
                "template_type": "generic",
                "elements": elements
            }
        }
    };
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
          console.log('Error sending message: ', error);
        } else if (response.body.error) {
          console.log('Error: ', response.body.error);
        }
    });

}

function sendTextMessage(sender, text) {
    messageData = {
        text:text
    }
    request({
        url: 'https://graph.facebook.com/v2.6/me/messages',
        qs: {access_token:token},
        method: 'POST',
        json: {
            recipient: {id:sender},
            message: messageData,
        }
    }, function(error, response, body) {
        if (error) {
            console.log('Error sending messages: ', error)
        } else if (response.body.error) {
            console.log('Error: ', response.body.error)
        }
    })
}

function sendPostmatesMessage(sender) {
  messageData = {
    "attachment": {
      "type": "template",
      "payload": {
        "template_type": "generic",
        "elements": [{
          "title": "Postmates Order",
          "image_url": "https://lh5.ggpht.com/cQrz8n4yOQmlSfkJJINC_b4gFpZYnBQorGGBuDB7zzDh_bWUgXqSt7xNx3_ZsvLMjHKa=w300",
          "buttons": [{
            "type": "web_url",
            "url": "https://postmates.com/la/fat-sals-westwood-los-angeles/view/6448c8fa-cd14-4709-a983-2e88aff08a12",
            "title": "Order Fat Sal's"
          }, {
            "type": "web_url",
            "url": "https://postmates.com/los-angeles",
            "title": "Order Something Else in Westwood"
            
          }]
        }]
      }
    }
};
  request({
    url: 'https://graph.facebook.com/v2.6/me/messages',
    qs: {access_token:token},
    method: 'POST',
    json: {
      recipient: {id:sender},
      message: messageData,
    }
  }, function(error, response, body) {
    if (error) {
      console.log('Error sending message: ', error);
    } else if (response.body.error) {
      console.log('Error: ', response.body.error);
    }
  });
}

function hungry(sender)
{
    var delivery = {
      pickup_address: "972 Gayley Ave, Los Angeles, CA",
      dropoff_address: "407 Charles E Young Dr W, Los Angeles, CA"
    };

    postmates.quote(delivery, function(err, res) {
    console.log(res.body.fee);  
    var price = (Number(res.body.fee)/100)
    sendTextMessage(sender, "Delivery fee for a Postmates order to you comes out to be: " + "$" + price.toFixed(2));
    });

    sendPostmatesMessage(sender);

}


//     // var delivery = {
//     //     manifest: "a sandwhich",
//     //     pickup_name: "The Warehouse",
//     //     pickup_address: "20 McAllister St, San Francisco, CA",
//     //     pickup_phone_number: "555-555-5555",
//     //     pickup_business_name: "Optional Pickup Business Name, Inc.",
//     //     pickup_notes: "Optional note that this is Invoice #123",
//     //     dropoff_name: "Alice",
//     //     dropoff_address: "101 Market St, San Francisco, CA",
//     //     dropoff_phone_number: "415-555-1234",
//     //     dropoff_business_name: "Optional Dropoff Business Name, Inc.",
//     //     dropoff_notes: "Optional note to ring the bell",
//     //     quote_id: "qUdje83jhdk"
//     // };
 
//     // postmates.new(delivery, function(err, res) {
//     //     // `res.body` 
// });












