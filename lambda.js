var https = require('https')

exports.handler = (event, context) => {

  try {
    if (event.session.new) {
      console.log("NEW SESSION")
    }

    switch (event.request.type) {
      case "LaunchRequest":
        console.log(`LAUNCH REQUEST`);
        
        swear().then((word) => {
            context.succeed(spk("Du " + word))
        })
        
        break;

      case "IntentRequest":
        console.log(`INTENT REQUEST`)

        switch(event.request.intent.name) {
          case "Insult": {
                var body = "";
                https.get(`https://s3-eu-west-1.amazonaws.com/swear-words/swear-words.json`, (response) => {
                  response.on('data', (chunk) => { body += chunk })
                  response.on('end', () => {
                    var data = JSON.parse(body);
                    shuffle(data);
                    
                    const insults = data
                        .slice(0, 100)
                        .map((word) => `Du ${word}`)
                        .join(', ');
                        
                    console.log("DONE");
                    context.succeed(speak(`<prosody volume="x-loud">${insults}</prosody>`));
                  })
                });
          } break;
            
          case "List":
                var day = resolveDay(event, 'day') || "2017-10-29";
                console.log(`Listing events for ${day}.`);
                
                Promise.all([fetchEvents(`starts_at_min=${day}T00:00:00Z&starts_at_max=${day}T23:59:59Z`), swear()])
                    .then(([events, word]) => {
                        context.succeed(speak(`${word}, Es gibt ${events.length} Veranstaltungen.
                            Die ersten drei Ergebnisse sind ${events[0].title}, 
                            ${events[1].title} und ${events[2].title}.`))
                    });
            break;
            
            case "Dialog":
                console.log("Starting dialog.");
                console.log(JSON.stringify(event, null, 4));
                
                if (!event.request.dialogState || event.request.dialogState == "STARTED" || event.request.dialogState == "IN_PROGRESS") {
                    context.succeed({
                        "version": "1.0",
                        "response": {
                            "directives": [
                                {
                                    "type": "Dialog.Delegate"
                                }
                            ],
                            "shouldEndSession": false
                        },
                        "sessionAttributes": {}
                    });
                } else {
                    var resolved = resolveText(event, 'category');
                    Promise.all([fetchEvents(`categories=${resolved}`), swear()])
                        .then(([events, word]) => {
                            const count = events.length;
                            if (count === 0) {
                                context.succeed(spk(`Nichts los, du ${word}.`));
                            }
                            
                            if (count === 1) {
                                context.succeed(speak(`Ey ${word}, ich habe eine Veranstaltung gefunden. ${present(events[0])}.`));
                            }
                            
                            let answer = `Ich habe ${count} Veranstaltungen gefunden, du ${word}. `;
                            for (let i = 0; i < Math.min(3, events.length); ++i) {
                                answer += events[i].title + `<break time="300ms" /> `;
                            }
                            answer += " Worüber willst du mehr erfahren?";
                            
                            const result = speak(answer);
                            result.response.shouldEndSession = false;
                            result.response.directives = [{
                                "type": "Dialog.ElicitSlot",
                                "slotToElicit": "title"
                            }];
                            
                            console.log("Checking for title.");
                            console.log(JSON.stringify(result, null, 4));
                            context.succeed(result)  
                        })
                }
                
                break;
                
            case "SearchName":
                var val = event.request.intent.slots.name.value;
                fetchEvents(`search=${val}&limit=50`).then((events) =>  {
                    let answer = `Ich habe ${val} verstanden und ${events.length} Ergebnisse gefunden. `;
                    
                    const byTitle = {};
                    for (var i in events) {
                        let e = events[i];
                        let dete = new Date(e.starts_at);
                        console.log(`Registering event title ${e.title} at ${dete}.`)
                        
                        if(!byTitle[e.title] || byTitle[e.title].getTime() > dete.getTime()) {
                            byTitle[e.title] = dete;
                        }
                    }
                    
                    console.log(JSON.stringify(byTitle, null, 4));
                    for (var title in byTitle) {
                        answer += title + ` zuerst am ${sayDate(byTitle[title])}. `;
                    }
                    
                    context.succeed(speak(answer))
                })
                break;
          default:
            throw "Invalid intent"
        }

        break;

      case "SessionEndedRequest":
        console.log(`SESSION ENDED REQUEST`)
        console.log(JSON.stringify(event, null, 4));
        break;

      default:
        context.fail(`INVALID REQUEST TYPE: ${event.request.type}`)
    }

  } catch(error) { 
      console.log(JSON.stringify(error, null, 4))
      context.fail(`Exception: ${error}`) 
  }
}


resolveText = (event, slotName) => {
    console.log(JSON.stringify(event.request.intent.slots, null, 4));
    
    var slot = event.request.intent.slots[slotName];
    var value = slot.value && slot.value.toLowerCase(); 
    var resolutions = slot && slot.resolutions && slot.resolutions.resolutionsPerAuthority;
    var resolved = resolutions && resolutions[0].values && resolutions[0].values[0] && resolutions[0].values[0].value.name;
    
    console.log(`Got slot '${slotName}' with value '${value}' resolved to '${resolved}'.`);
    return resolved;
}

resolveDay = (event, slotName) => {
    console.log(JSON.stringify(event.request.intent.slots, null, 4));
    
    var slot = event.request.intent.slots[slotName];
    return slot.value;
}

fetchEvents = (parameters) => {
    console.log(`Attempting to fetch events for ${parameters}.`);
    
    return new Promise((resolve, reject) => {
        var body = "";
        https.get('https://api.my-eventer.de/v1/events?' + parameters, (response) => {
          response.on('data', (chunk) => { body += chunk })
          response.on('end', () => {
            var data = JSON.parse(body);
            
            console.log(`Got event data for parameters ${parameters}.`);
            console.log(JSON.stringify(data, null, 4));
            
            resolve(data.events);
          })
        })
    });
}

swear = () => {
    console.log(`Fetching swear word.`);
    return Promise.resolve("Sträuselkuchen");
    /**return new Promise((resolve, reject) => {
        var body = "";
        https.get(`https://s3-eu-west-1.amazonaws.com/swear-words/swear-words.json`, (response) => {
          response.on('data', (chunk) => { body += chunk })
          response.on('end', () => {
            var data = JSON.parse(body);
            var idx = Math.ceil(Math.random() * data.length);
            var word = data[idx];
            
            console.log(`Got swear word. Selected ${idx}: ${word}`);
            resolve(word);
          })
        });
    });*/
}

function shuffle(a) {
    for (let i = a.length; i--;) {
        const j = Math.floor(Math.random() * (i + 1));
        [a[i], a[j]] = [a[j], a[i]];
    }
}

speak = (ssml) => {
    return {
        version: "1.0",
        sessionAttributes: {},
        response: {
            outputSpeech: {
                type: "SSML",
                ssml: `<speak>${ssml}</speak>`
            },
            shouldEndSession: true
        }
    }
}

spk = (txt) => {
    return {
        version: "1.0",
        sessionAttributes: {},
        response: {
            outputSpeech: {
              type: "PlainText",
              text: txt
            },
            shouldEndSession: true
        }
    }
}

present = (event) => {
    return `${event.title} findet am ${sayDate(event.starts_at)} statt.`
}

sayDate = (str) => {
    const date = new Date(str);
    const minutes = (date.getMinutes() < 10) ? "0" + date.getMinutes() : date.getMinutes();
    return `<say-as interpret-as="date" format="dm">${date.getDate()}/${date.getMonth() + 1}</say-as> `
           + `um <say-as interpret-as="time">${date.getHours()}:${minutes}</say-as>`;
}
