var express = require('express')
var bodyParser = require('body-parser')
var request = require('request')
var rest = require('restler')
var md5 = require('md5')
var app = express()

var base_url = "http://gateway.marvel.com"
var characters_base = "/v1/public/characters"
var comics_base = "/v1/public/comics"
var public_key = "9aaf771e2b960537d98d91ff2451b2d6"
var private_key = "aba10e9f584d245bd51f13a9ce8111d142f27d00"
var api_key = "?apikey=" + public_key

var ts = 0;

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
    ts = ts + 1
    for (i = 0; i < messaging_events.length; i++) {
        event = req.body.entry[0].messaging[i]
        sender = event.sender.id
        if (event.message && event.message.text) {
            text = event.message.text
            if (text.toLowerCase() == "list characters") {
            	listAllCharacters()
            }
            sendTextMessage(sender, "Text received, echo: " + text.substring(0, 200))
        }
    }
    res.sendStatus(200)
})

var token = "EAAYJpbaJfuUBAGrHv5892ANU1ER1ZBzqIpK0xnG5ZBKkdSQqSpNaFRjp8diPAfYLWoYpL3VyakXsOa1aHczQZCJ3BZCuSt8kKzQfUpnADSVhxzuZCBElw1MS4e9t9qk9jS8ZAV4wrZAQUppbsAc7FRcpA4QP1Czz0vdRGvSbGWukAZDZD"

function listAllCharacters() {
	var url = base_url + characters_base + "&ts=" + ts + api_key + "&hash=" + md5(ts+private_key+public_key);
	console.log(url)
	rest.get(url).on('complete', function(data) {
		console.log(data)
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















