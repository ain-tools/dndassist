'use strict';
const { NlpManager } = require('node-nlp');
const manager = new NlpManager({ languages: ['en'] });
const Fuse = require('fuse.js');
const keyword_extractor = require("keyword-extractor");
var FuzzyMatching = require('fuzzy-matching');
const jsonfile = require('jsonfile');
let monstersJSONFile;

jsonfile.readFile('../data/monsters.json', function (err, obj) {
    monstersJSONFile = obj;
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
    manager.addDocument('en', 'does healing from rest involve constitution', 'question.rule');
    manager.addDocument('en', 'does attack bonus increase my damage', 'question.rule');
    manager.addDocument('en', 'what does advantage do', 'question.rule');
    manager.addDocument('en', 'describe to me an amber', 'question.general');
    manager.addDocument('en', 'describe to me a burglar pack', 'question.general');
    manager.addDocument('en', 'describe a ship', 'question.general');
    manager.addDocument('en', 'describe the spell absorb elements', 'question.spell.');
    manager.addDocument('en', 'what spells can a bards use at level 4', 'question.spell');
    manager.addDocument('en', 'what does the spell ice breath do', 'question.spell');
    manager.addDocument('en', 'can fighters use action surge', 'question.spell');
    manager.addDocument('en', 'can barbarians use fireball', 'question.spell');
    manager.addDocument('en', 'can monks learn heal', 'question.spell');
    manager.addDocument('en', 'what are the class features of a barbarian?', 'question.class');
    manager.addDocument('en', 'what are the starting proficiencies of a sorcerer?', 'question.class');
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
                extraction_result.push(combinedElement);
                //categorize question
                if (questionCategory == "question.monster") {
                    let foundObjects = [];
                    findFromKeywords(monstersJSONFile.monster, extraction_result, (results) => {
                        foundObjects.push(results[0]);
                    });

                    let lowestScoreObject = foundObjects[0];

                    //get names into array from found objects
                    let namesOfFoundObjects = [];
                    getNamesOfFoundObjects(foundObjects,(namesOfFoundObjectsCB)=>{
                        namesOfFoundObjects = namesOfFoundObjectsCB;
                    });

                    //finds best match of keywords
                    findBestMatchObject(namesOfFoundObjects,combinedElement,lowestScoreObject,foundObjects,(lowestScoreObjectCB)=>{
                        lowestScoreObject = lowestScoreObjectCB;
                    });

                    let indexesFound = [];
                    let valuesArray = [];

                    //find extra results from properties in best result
                    findSpecificAnswers(lowestScoreObject,extraction_result,(indexesFoundCB,valuesArrayCB)=>{
                        indexesFound = indexesFoundCB;
                        valuesArray = valuesArrayCB;
                    });

                    let responseArray = [];

                    //print sentence
                    printSentence(indexesFound,valuesArray,lowestScoreObject,(responseArrayCB)=>{
                        responseArray = responseArrayCB;
                    });

                    ctx.result = {
                        relatedQuestion: "Monster related question",
                        specificAnswer: responseArray,
                        moreInfo: lowestScoreObject
                    }
                    next();
                }
            })
        });
    });

    function getNamesOfFoundObjects(foundObjects,cb){
        let namesOfFoundObjects = [];
        for (let i = 0; i < foundObjects.length; i++) {
            namesOfFoundObjects.push(foundObjects[i].item.name);
        }
        cb(namesOfFoundObjects);
    }

    function findBestMatchObject(namesOfFoundObjects,combinedElement,lowestScoreObject,foundObjects,cb) {
        //check if combined elements is a match to found objects
        let matchedCombinedElement = new FuzzyMatching(namesOfFoundObjects);
        let combinedElementFound = matchedCombinedElement.get(combinedElement);

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

    function findSpecificAnswers(lowestScoreObject,extraction_result,cb) {
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
        cb(indexesFound,valuesArray);
    }

    function printSentence(indexesFound,valuesArray,lowestScoreObject,cb) {
        let responseArray = [];

        //print sentence
        for (let i = 0; i < indexesFound.length; i++) {
            if (typeof valuesArray[indexesFound[i].index] != Object) {
                let response = "The " + indexesFound[i].property + " of a " + lowestScoreObject.item.name + " is " + JSON.stringify(valuesArray[indexesFound[i].index]) + ".";
                //response = response.replace(/[`~!@#$%^&*()_|+\-=?;,.<>\\[\]\\\/]/gi, ' ');
                responseArray.push(response);
            } else {
                let response = "The " + indexesFound[i].property + " of a " + lowestScoreObject.item.name + " is " + valuesArray[indexesFound[i].index] + ".";
                //response = response.replace(/[`~!@#$%^&*()_|+\-=?;:'",.<>\\[\]\\\/]/gi, ' ');
                responseArray.push(response);
            }
        }
        cb(responseArray);
    }

    //return question category
    function categorizeQuestion(questionOfUser, cb) {
        manager.train();
        manager.save();
        const category = manager.process('en', questionOfUser);
        cb(category);
    }

    //find json object from keywords
    function findFromKeywords(file, keywords, cb) {
        //console.log(keywords)
        var options = {
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
        let fuse = new Fuse(file, options);
        for (let i = 0; i < keywords.length; i++) {
            let result = fuse.search(keywords[i]);
            cb(result);
        }

    }

};
