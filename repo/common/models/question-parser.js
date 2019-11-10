'use strict';
const json2table = require('json-table-converter');
const { NlpManager } = require('node-nlp');
const manager = new NlpManager({ languages: ['en'] });
const Fuse = require('fuse.js');
const keyword_extractor = require("keyword-extractor");
var FuzzyMatching = require('fuzzy-matching');
const jsonfile = require('jsonfile');
let monstersJSONFile;
let ruleJSONFile;
let miscJSONFile;
let spellJSONFile;
let classJSONFile;
let encounterJSONfile;

jsonfile.readFile('../data/monsters.json', function (err, obj) {
    monstersJSONFile = obj;
});
jsonfile.readFile('../data/rules.json', function (err, obj) {
    ruleJSONFile = obj;
});
jsonfile.readFile('../data/misc.json', function (err, obj) {
    miscJSONFile = obj;
});
jsonfile.readFile('../data/spells.json', function (err, obj) {
    spellJSONFile = obj;
});
jsonfile.readFile('../data/class.json', function (err, obj) {
    classJSONFile = obj;
});
jsonfile.readFile('../data/randomencounters.json', function (err, obj) {
    encounterJSONfile = obj;
});

module.exports = function (Questionparser) {
    //parses the question into one of 6 categories:monster,rule,general,spell,class,encounter,loot,lore,rule conflict, and queries for data,then formulates it as a questions

    // training NLP to seperate question categories
    manager.addDocument('en', 'what are the stats of a goblin', 'question.monster');
    manager.addDocument('en', 'what are the traits of Splugoth the Returned', 'question.monster');
    manager.addDocument('en', 'what is the speed of a zombie', 'question.monster');
    manager.addDocument('en', 'what is the hp of Ebondeath', 'question.monster');
    manager.addDocument('en', 'what is the ac of Amphisbaena', 'question.monster');
    manager.addDocument('en', 'what are the rules for constitution', 'question.rule');
    manager.addDocument('en', 'what are the rules for initiative', 'question.rule');
    manager.addDocument('en', 'tell me the rules about', 'question.rule');
    manager.addDocument('en', 'does healing from rest involve constitution', 'question.rule');
    manager.addDocument('en', 'does attack bonus increase my damage', 'question.rule');
    manager.addDocument('en', 'what does advantage do', 'question.rule');
    manager.addDocument('en', 'describe to me an amber', 'question.general');
    manager.addDocument('en', 'describe to me a burglar pack', 'question.general');
    manager.addDocument('en', 'describe a ship', 'question.general');
    manager.addDocument('en', 'describe the spell absorb elements', 'question.spell');
    //manager.addDocument('en', 'what spells can a bards use at level 4', 'question.spell');
    manager.addDocument('en', 'what does the spell ice breath do', 'question.spell');
    //manager.addDocument('en', 'can fighters use action surge', 'question.spell');
    //manager.addDocument('en', 'can barbarians use fireball', 'question.spell');
    manager.addDocument('en', 'can monks learn heal', 'question.spell');
    manager.addDocument('en', 'For a barbarian, what are the class features?', 'question.class');
    manager.addDocument('en', 'For a sorcerer, what are the starting proficiencies?', 'question.class');
    manager.addDocument('en', 'what can a level 4 encounter in the artic?', 'question.randomEncounter');
    manager.addDocument('en', 'what can a level 9 encounter in the desert?', 'question.randomEncounter');
    manager.addDocument('en', 'random encounter in the desert at level 5?', 'question.randomEncounter');
    //manager.addDocument('en', 'hi', 'question.loot'); 
    //manager.addDocument('en', 'howdy', 'question.lore');
    //manager.addDocument('en', 'howdy', 'question.ruleConflict');

    //http request handler
    Questionparser.afterRemote("create", (ctx, model, next) => {
        categorizeQuestion(ctx.args.data.questionOfUser, (category) => {
            category.then((result) => {
                //console.log(result);
                let questionCategory = result.intent;
                //extract keywords from sentence
                let sentence = ctx.args.data.questionOfUser;
                let extraction_result = keyword_extractor.extract(sentence, {
                    language: "english",
                    remove_digits: false,
                    return_changed_case: true,
                    remove_duplicates: false
                });
                //create combined element as well
                let combinedElement = "";
                for (let i = 1; i < extraction_result.length; i++) {
                    combinedElement += extraction_result[i] + " ";
                }
                //console.log(questionCategory);
                //categorize question
                if (questionCategory == "question.monster") {
                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            'name'
                        ]
                    };
                    findFromKeywords(monstersJSONFile.monster, extraction_result, options, (results) => {
                        foundObjects.push(results[0]);
                    });

                    let lowestScoreObject = foundObjects[0];

                    //get names into array from found objects
                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects, (namesOfFoundObjectsCB) => {
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    //finds best match of keywords
                    findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, true, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let indexesFound = [];
                    let valuesArray = [];

                    //find extra results from properties in best result
                    findSpecificAnswers(lowestScoreObject, extraction_result, (indexesFoundCB, valuesArrayCB) => {
                        indexesFound = indexesFoundCB;
                        valuesArray = valuesArrayCB;
                    });

                    let responseArray = [];

                    //print sentence
                    printSentence(indexesFound, valuesArray, lowestScoreObject, (responseArrayCB) => {
                        responseArray = responseArrayCB;
                    });

                    removeMatches(lowestScoreObject, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    ctx.result = {
                        relatedQuestion: "Monster related question",
                        specificAnswer: responseArray,
                        moreInfo: json2table.jsonToTableHtmlString(lowestScoreObject.item,{tableStyle:"background-color:gray;border:solid;border-color:gray;",trStyle:"background-color:black;border:solid;border-color:gray;",thStyle:"background-color:black;border:solid;border-color:gray;",tdStyle:"background-color:black;border:solid;border-color:gray;",tdKeyStyle:"background-color:black;border:solid;border-color:gray;"})
                    }
                    next();
                } else if (questionCategory == "question.rule") {

                    //removing rule keyword
                    let foundIndexOfRules;
                    for (let i = 0; i < extraction_result.length; i++) {
                        if (extraction_result[i] == "rule" || extraction_result[i] == "rules") {
                            foundIndexOfRules = i;
                        }
                    }
                    extraction_result.splice(foundIndexOfRules, 1);

                    if (combinedElement == extraction_result[0]) {
                        console.log(combinedElement, extraction_result[0]);
                        extraction_result.splice(1, 1);
                    }

                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeMatches: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            "entries.name",
                            "entries.entries.name",
                            "entries.entries.entries.name",
                            "entries.entries.entries.entries.name",
                            "entries.entries.entries.entries.entries.name",
                            "entries.entries.entries.entries.entries.entries.name",
                            "entries.entries.entries.entries.entries.entries.name.name",
                            'name'
                        ]
                    };
                    findFromKeywords(ruleJSONFile.data, extraction_result, options, (results) => {
                        foundObjects.push(results[0]);
                    });
                    let lowestScoreObject = foundObjects[0];

                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects, (namesOfFoundObjectsCB) => {
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, true, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let matchingKeywords;
                    findMatchIndice(extraction_result, lowestScoreObject.matches, (matchingKeywordsCB) => {
                        matchingKeywords = matchingKeywordsCB;
                    });

                    removeMatches(lowestScoreObject, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let responseArray = [];
                    for (let i = 0; i < matchingKeywords.length; i++) {
                        findPropertyValueOfObject(matchingKeywords[i], lowestScoreObject, (value) => {
                            responseArray.push(value.replace(/[`~!@#$%^&*()"'_|+\-=?;<>\{\}\[\]\\\/]/gi, ' '));
                        })
                    }

                    ctx.result = {
                        relatedQuestion: "Rule related question",
                        specificAnswer: responseArray
                    }
                    next();
                } else if (questionCategory == "question.general") {

                    //removing rule keyword
                    let foundIndexOfRules;
                    for (let i = 0; i < extraction_result.length; i++) {
                        if (extraction_result[i] == "describe" || extraction_result[i] == "Describe") {
                            foundIndexOfRules = i;
                        }
                    }
                    extraction_result.splice(foundIndexOfRules, 1);

                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            'name'
                        ]
                    };
                    findFromKeywords(miscJSONFile.data, extraction_result, options, (results) => {
                        foundObjects.push(results[0]);
                    });
                    let lowestScoreObject = foundObjects[0];

                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects, (namesOfFoundObjectsCB) => {
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, true, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    ctx.result = {
                        relatedQuestion: "General related question",
                        moreInfo: json2table.jsonToTableHtmlString(lowestScoreObject.item,{tableStyle:"background-color:gray;border:solid;border-color:gray;",trStyle:"background-color:black;border:solid;border-color:gray;",thStyle:"background-color:black;border:solid;border-color:gray;",tdStyle:"background-color:black;border:solid;border-color:gray;",tdKeyStyle:"background-color:black;border:solid;border-color:gray;"})
                    }
                    next();

                } else if (questionCategory == "question.spell") {
                    
                    //removing rule keyword
                    let foundIndexOfRules;
                    for (let i = 0; i < extraction_result.length; i++) {
                        if (extraction_result[i] == "spell" || extraction_result[i] == "spells" || extraction_result[i].toLowerCase() == "describe") {
                            foundIndexOfRules = i;
                            extraction_result.splice(foundIndexOfRules, 1);
                        }
                    }

                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            'name'//,
                            //'classes.fromClassList.name',
                            //'level'
                        ]
                    };
                    findFromKeywords(spellJSONFile.spell, extraction_result, options, (results) => {
                        foundObjects.push(results[0]);
                    });
                    let lowestScoreObject = foundObjects[0];

                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects, (namesOfFoundObjectsCB) => {
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, true, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    ctx.result = {
                        relatedQuestion: "Spell related question",
                        moreInfo: json2table.jsonToTableHtmlString(lowestScoreObject.item,{tableStyle:"background-color:gray;border:solid;border-color:gray;",trStyle:"background-color:black;border:solid;border-color:gray;",thStyle:"background-color:black;border:solid;border-color:gray;",tdStyle:"background-color:black;border:solid;border-color:gray;",tdKeyStyle:"background-color:black;border:solid;border-color:gray;"})
                    }
                    next();

                } else if (questionCategory == "question.class") {
                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            'name'
                        ]
                    };
                    findFromKeywords(classJSONFile.class, extraction_result, options, (results) => {
                        foundObjects.push(results[0]);
                    });

                    let lowestScoreObject = foundObjects[0];

                    //get names into array from found objects
                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects, (namesOfFoundObjectsCB) => {
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    //finds best match of keywords
                    findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, true, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let indexesFound = [];
                    let valuesArray = [];

                    //find extra results from properties in best result
                    findSpecificAnswers(lowestScoreObject, extraction_result, (indexesFoundCB, valuesArrayCB) => {
                        indexesFound = indexesFoundCB;
                        valuesArray = valuesArrayCB;
                    });

                    let responseArray = [];

                    //print sentence
                    printSentence(indexesFound, valuesArray, lowestScoreObject, (responseArrayCB) => {
                        responseArray = responseArrayCB;
                    });

                    removeMatches(lowestScoreObject, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    ctx.result = {
                        relatedQuestion: "Class related question",
                        specificAnswer: responseArray,
                        moreInfo: json2table.jsonToTableHtmlString(lowestScoreObject.item,{tableStyle:"background-color:gray;border:solid;border-color:gray;",trStyle:"background-color:black;border:solid;border-color:gray;",thStyle:"background-color:black;border:solid;border-color:gray;",tdStyle:"background-color:black;border:solid;border-color:gray;",tdKeyStyle:"background-color:black;border:solid;border-color:gray;"})
                    }
                    next();
                } else if (questionCategory == "question.randomEncounter") {
                    let foundObjects = [];
                    let options = {
                        caseSensitive: false,
                        shouldSort: true,
                        includeScore: true,
                        threshold: 0.8,
                        location: 0,
                        distance: 1,
                        maxPatternLength: 32,
                        minMatchCharLength: 1,
                        keys: [
                            'name'
                        ]
                    };
                    findFromKeywords(encounterJSONfile.encounter, extraction_result, options, (results) => {
                        if(results[0] != undefined){
                            foundObjects.push(results[0]);
                        }
                    });
                    //console.log(foundObjects);
                    let lowestScoreObject = foundObjects[0];

                    //finds best match of keywords
                    findLowestScoreObject( foundObjects, lowestScoreObject, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let response;
                    getMonstersFromLevel(lowestScoreObject,extraction_result,(responseCB)=>{
                        response = responseCB;
                    })

                    removeMatches(lowestScoreObject, (lowestScoreObjectCB) => {
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let randomNumber = Math.floor(Math.random() * response.length);
                    let randomAnswer = response[randomNumber];
                    ctx.result = {
                        relatedQuestion: "Encounter related question",
                        specificAnswer: randomAnswer,
                        moreInfo: json2table.jsonToTableHtmlString(response,{tableStyle:"background-color:gray;border:solid;border-color:gray;",trStyle:"background-color:black;border:solid;border-color:gray;",thStyle:"background-color:black;border:solid;border-color:gray;",tdStyle:"background-color:black;border:solid;border-color:gray;",tdKeyStyle:"background-color:black;border:solid;border-color:gray;"})
                    }
                    next();
                } else {
                    ctx.result = {
                        relatedQuestion: "Error understanding your question.",
                        specificAnswer: "I don't speak troll. Consult the guide on the bottom left corner."
                    }
                    next();
                }
            })
        });
    });





    
    //for random encounters
    function getMonstersFromLevel(lowestScoreObject,keywords,cb){
        let levelOfPlayer;
        let listOfPossibleMonsters = [];
        for(let i = 0; i < keywords.length; i++){
            if(parseInt(keywords[i])){
                levelOfPlayer = keywords[i];
            }
        }
        for(let i = 0; i < lowestScoreObject.item.tables.length; i++){
            if(levelOfPlayer >= lowestScoreObject.item.tables[i].minlvl && levelOfPlayer <= lowestScoreObject.item.tables[i].maxlvl){
                for(let x = 0; x < lowestScoreObject.item.tables[i].table.length; x++){
                    listOfPossibleMonsters.push(lowestScoreObject.item.tables[i].table[x].result.replace(/[`~!@#$%^&*()"'_+\-=?;<>\{\}\[\]\\\/]/gi, ' ').replace(/creature/g, '').replace(/\s+/g,' ').trim());
                }
            }
        }
        cb(listOfPossibleMonsters);
    }

    function getNamesOfFoundObjects(foundObjects, cb) {
        let namesOfFoundObjects = [];
        for (let i = 0; i < foundObjects.length; i++) {
            namesOfFoundObjects.push(foundObjects[i].item.name);
        }
        cb(namesOfFoundObjects);
    }

    function findBestMatchObject(namesOfFoundObjects, combinedElement, lowestScoreObject, foundObjects, checkCombinedEle, cb) {
        //check if combined elements is a match to found objects
        let matchedCombinedElement;
        let combinedElementFound;
        if (checkCombinedEle) {
            matchedCombinedElement = new FuzzyMatching(namesOfFoundObjects);
            combinedElementFound = matchedCombinedElement.get(combinedElement);
        }

        //get object of matched found combined element
        if (combinedElementFound != null) {
            for (let i = 0; i < namesOfFoundObjects.length; i++) {
                if (combinedElementFound.value == namesOfFoundObjects[i]) {
                    lowestScoreObject = foundObjects[i];
                }
            }
        }

        if (combinedElement == null) {
            //find best result
            for (let i = 0; i < foundObjects.length; i++) {
                if (foundObjects[i + 1] != undefined && foundObjects[i].score < foundObjects[i + 1].score) {
                    lowestScoreObject = foundObjects[i];
                } else if (foundObjects[i + 1]) {
                    lowestScoreObject = foundObjects[i + 1];
                }
            }
        }
        cb(lowestScoreObject);
    }

    function findLowestScoreObject(foundObjects,lowestScoreObject,cb){
        //find best result
        for (let i = 0; i < foundObjects.length; i++) {
            if (foundObjects[i + 1] != undefined && foundObjects[i].score < foundObjects[i + 1].score) {
                lowestScoreObject = foundObjects[i];
            } else if (foundObjects[i + 1]) {
                lowestScoreObject = foundObjects[i + 1];
            }
        }
        cb(lowestScoreObject);
    }

    function findSpecificAnswers(lowestScoreObject, extraction_result, cb) {
        //find extra results from properties in best result
        let keysArray = Object.keys(lowestScoreObject.item);
        let valuesArray = Object.values(lowestScoreObject.item);

        let fm = new FuzzyMatching(keysArray);
        let propertyFound = [];
        //match property to keyword
        for (let i = 0; i < extraction_result.length; i++) {
            if (fm.get(extraction_result[i]).value != null) {
                propertyFound.push(fm.get(extraction_result[i]));
            }
        }

        let indexesFound = [];
        //store property and index
        for (let i = 0; i < keysArray.length; i++) {
            for (let x = 0; x < propertyFound.length; x++) {
                if (keysArray[i] == propertyFound[x].value) {
                    let foundOBJ = {
                        property: propertyFound[x].value,
                        index: i
                    }
                    indexesFound.push(foundOBJ);
                }
            }
        }
        cb(indexesFound, valuesArray);
    }

    function printSentence(indexesFound, valuesArray, lowestScoreObject, cb) {
        let responseArray = [];

        //print sentence
        for (let i = 0; i < indexesFound.length; i++) {
            if (typeof valuesArray[indexesFound[i].index] != Object) {
                let response = "The " + indexesFound[i].property + " of " + lowestScoreObject.item.name + " is " + JSON.stringify(valuesArray[indexesFound[i].index]) + ".";
                //response = response.replace(/[`~!@#$%^&*()_|+\-=?;,.<>\\[\]\\\/]/gi, ' ');
                responseArray.push(response.replace(/[`~!@#$%^&*()"'_|+\-=?;<>\{\}\[\]\\\/]/gi, ' ').replace(/\s+/g,' ').trim());
            } else {
                let response = "The " + indexesFound[i].property + " of " + lowestScoreObject.item.name + " is " + valuesArray[indexesFound[i].index] + ".";
                //response = response.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\\[\]\\\/]/gi, ' ');
                responseArray.push(response.replace(/[`~!@#$%^&*()"'_|+\-=?;<>\{\}\[\]\\\/]/gi, ' ').replace(/\s+/g,' ').trim());
            }
        }
        cb(responseArray);
    }

    function findMatchIndice(keywords, matches, cb) {
        //get values of matches
        let valueMatches = [];
        for (let i = 0; i < matches.length; i++) {
            valueMatches.push(matches[i].value);
        }
        //find matching keywords
        let matchingValues = [];
        for (let i = 0; i < keywords.length; i++) {
            let fm = new FuzzyMatching(valueMatches);
            let matchingKeyword = fm.get(keywords[i]);
            matchingValues.push(matchingKeyword.value);
        }
        cb(matchingValues);
    }

    function removeMatches(lowestScoreObject, cb) {
        delete lowestScoreObject.matches;
        cb(lowestScoreObject);
    }

    //return question category
    function categorizeQuestion(questionOfUser, cb) {
        manager.train();
        manager.save();
        const category = manager.process('en', questionOfUser);
        cb(category);
    }

    //find json object from keywords
    function findFromKeywords(file, keywords, options, cb) {
        let fuse = new Fuse(file, options);
        for (let i = 0; i < keywords.length; i++) {
            let result = fuse.search(keywords[i]);
            cb(result);
        }

    }

    function findPropertyValueOfObject(property, object, cb) {
        let stringifiedObj = JSON.stringify(object);
        let regex = new RegExp('(?:"' + property + ')(.*?)(?:})');
        let found = stringifiedObj.match(regex);
        cb("{" + found[0]);
    }

};
