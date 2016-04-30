var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var md5 = require('md5')
var api = require('marvel-api')
var app = express()
var token = "EAAYJpbaJfuUBAGrHv5892ANU1ER1ZBzqIpK0xnG5ZBKkdSQqSpNaFRjp8diPAfYLWoYpL3VyakXsOa1aHczQZCJ3BZCuSt8kKzQfUpnADSVhxzuZCBElw1MS4e9t9qk9jS8ZAV4wrZAQUppbsAc7FRcpA4QP1Czz0vdRGvSbGWukAZDZD"
var public_key = '9aaf771e2b960537d98d91ff2451b2d6'
var private_key = 'aba10e9f584d245bd51f13a9ce8111d142f27d00'
var marvel = api.createClient({
	publicKey: public_key,
	privateKey: private_key
});

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
            if (text.toLowerCase().startsWith("search")) {
            	searchForCharacter(text.substring(6).trim(), sender)
            }
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200))
        }
    }
    res.sendStatus(200)
})

function sendGenericMessage(sender, names, descriptions, thumbnails, detailsUrl, comicLinkUrls) {
	var elements = []
	var numCards = names.length
	for (i = 0; i < numCards; i++) {
		var card = {
			"title": names[i],
			"subtitle": descriptions[i],
			"image_url": thumbnails[i],
			"buttons": [{
				"type": "web_url",
				"url": detailsUrl,
				"title": "More Information"
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

function searchForCharacter(search, sender) {
	marvel.characters.findNameStartsWith(search).then(function(res) {
		var data = res.data
		var count = res.meta.count
		var names = []
		var descriptions = []
		var thumbnails = []
		var detailsUrls = []
		var comicLinkUrls = []
		count = Math.min(10, res.meta.count) //Can only show a max of 10 items
		for(i = 0; i < count; i++) {
			var item = data[i]
			var name = item.name
			var description = item.description
			var thumbnailUrl = item.thumbnail.path + "." + item.thumbnail.extension
			var urls = item.urls
			var detailsUrl = ""
			var comicLinkUrl = ""
			for (j = 0; j < urls.length; j++) {
				var object = urls[j]
				if (object.type == "detail") {
					detailsUrl = object.url
				} else if (object.type == "comiclink") {
					comicLinkUrl = object.url
				}
			}
			names.push(name)
			descriptions.push(description)
			thumbnails.push(thumbnailUrl)
			detailsUrls.push(detailsUrl)
			comicLinkUrls.push(comicLinkUrls)
		}
		sendGenericMessage(sender, names, descriptions, thumbnails, detailsUrl, comicLinkUrls)
	})
    
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















