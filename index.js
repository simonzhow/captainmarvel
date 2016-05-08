var _ = require('underscore')
var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var md5 = require('md5')
var marvel_api = require('marvel-api')
var app = express()
const facebook_token = process.env.facebook_token
const marvel_public_key = process.env.marvel_public_key
const marvel_private_key = process.env.marvel_private_key
var marvelClient = marvel_api.createClient({
    publicKey: marvel_public_key,
    privateKey: marvel_private_key
});

var wit_api = require('node-wit').Wit;
var wit_token = process.env.wit_token
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
var wit_client = new wit_api(wit_token, actions);

const ERROR_STRING = "Results not found. Type \"help\" for assistance."


app.set('port', (process.env.PORT || 5000))

// Process application/x-www-form-urlencoded
app.use(bodyParser.urlencoded({extended: false}))

// Process application/json
app.use(bodyParser.json())

app.use(express.static('website'))

// Index route
app.get('/', function (req, res) {
    res.send('Hello world, I am a chat bot')
})

// for Facebook verification
app.get('/webhook/', function (req, res) {
    if (req.query['hub.verify_token'] === 'marvel_la_hacks') {
        res.send(req.query['hub.challenge'])
    }
    res.send('Error, wrong facebook_token')
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
			wit_client.message(text, function (error, data) {
                if (error) {
                    // wit_api could not parse the string
                    return
                } 
                console.log('Yay, got wit_api.ai response: ' + JSON.stringify(data));
                var entities = data.outcomes[0].entities;
                var skipEntities = false;
                if (!_.has(entities, 'intent') && _.has(entities, 'object')) {
                    var funcToRun = searchForGeneric
                    skipEntities = true; 
                }
                if (!_.has(entities, 'object')) {
                    sendTextMessage(sender, ERROR_STRING)
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
                    case "search_events_for_character":
                        var funcToRun = searchEventsForCharacter
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
            searchComicsByEvent(numb, sender)
        } else if (payload == "characters_for_event_id") {
            searchForCharacterByEvent(numb, sender)
        }
        
    }
    res.sendStatus(200)
})

function searchForCharacterByQuery(search, sender) {
    marvelClient.characters.findNameStartsWith(search).then(extractCharacterInfo)
}

function searchEventsForCharacter(query, sender) {
    marvelClient.characters.findNameStartsWith(query).then(function(res) {
        var count = res.meta.count
        if (count == 0) {
            sendTextMessage(sender, "Results not found. Type \"help\" for assistance.")
            return "-1"
        }
        marvelClient.characters.events(res.data[0].id).then(function(res) {
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
    })
}

function searchForCharacterByEvent(id, sender) {
    marvelClient.events.characters(id).then(extractCharacterInfo)
}



function getComicsForCharacter(query, sender) {
    marvelClient.characters.findNameStartsWith(query).then(function(res) {
        var count = res.meta.count
        if (count == 0) {
            sendTextMessage(sender, ERROR_STRING)
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
        sendTextMessage(sender, ERROR_STRING)
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
	/*
        if(purchaseUrls[i] != null) { 
            var purchaseButton = {
                "type": "web_url",
                "url": purchaseUrls[i],
                "title": "Buy Here"
            }
            buttons.push(purchaseButton)
        }
	*/
        if(readerUrls[i] != null) {
            var urlButton = {
                "type": "web_url",
                "url": readerUrls[i],
                "title": "Read Comic Online"
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
    qs: {access_token:facebook_token},
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
        // marvelClient.comics.
    }
    marvelClient.characters.comics(id).then(extractComicInfo) 
    console.log("exited searchForComic")
}

function searchComicsByEvent(id, sender) {
    marvelClient.events.comics(id).then(extractComicInfo)
}


function searchForEvent(search, sender) {
    marvelClient.events.findNameStartsWith(search).then(function(res) {
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
        sendTextMessage(sender, ERROR_STRING)
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
    qs: {access_token:facebook_token},
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
        sendTextMessage(sender, ERROR_STRING)
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
        qs: {access_token:facebook_token},
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
        qs: {access_token:facebook_token},
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

