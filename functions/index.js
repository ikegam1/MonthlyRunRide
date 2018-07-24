'use strict';

const functions = require('firebase-functions');
const { dialogflow, SignIn } = require('actions-on-google');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const config = require('./.env.json');
const CLIENT_ID = config.client_id;
const mysql = require('mysql');
const toDay = new Date();
var userId = '';

// MySQLとのコネクションの作成
const connection = mysql.createPool({
    socketPath: "/cloudsql/" + config.mysql.sock,
    user: config.mysql.user,
    database: config.mysql.db, 
    password: config.mysql.pw
});

// 接続
//connection.connect();

const app = dialogflow({
	  clientId: CLIENT_ID,
})

function getActivityKm(m,d,y){
	return 100;
}

function checkUUID(_userId){
	connection.query("SELECT * FROM users where ?", {uuid: _userId}, function (err, result, fields) {
            if (err) throw err;
	    if (result.length < 1){
	        connection.query("insert into users set ?",{uuid:_userId, metric:"km"},function(err2,result,fields){
                if (err2) throw err2;
	        console.log(result);
		return false;
    	  });
	    }
        });
	return true;
}

app.intent('Default Welcome Intent', conv => {
	  if (userId in conv.user.storage) {
	     userId = conv.user.storage.userId;
	  } else {
             let uuid = require('node-uuid');
             userId = uuid.v4();
	     conv.user.storage.userId = userId
	  }
	  console.log(conv.user.storage)
	  //userId = conv.user.id;
	  if (checkUUID(userId)){
	      conv.ask(`おかえりなさい！${toDay.getMonth()}は`+getActivityKm(toDay.getMonth(),false,false)+`km走りました。走行距離を記録、または記録を見ると言ってください。`);
	  } else {
	      conv.ask(`はじめまして！月間走行距離アプリへようこそ！走行距離を記録、または記録を見ると言ってください。`);
	  }
});

app.intent('create/content', conv => {
	  const storage = conv.user.storage;
	  const list = storage.list || [];
	  const inputText = conv.query;
	  conv.user.storage.list = [...list, inputText];
	  conv.close(`${inputText}、ですね。覚えておきます。`);
	  connection.query("insert into usertest3 set ?",{uid:userId, body:inputText, num:1},function(error,results,fields){
	     console.log(results);
    	  });
});

app.intent('refer', conv => {
	  const list = conv.user.storage.list;
	  if (list && list.length > 0) {
	      conv.ask(`${list[0]}、とのことです。消しますか？`);
	  } else {
	      conv.close('すいません、何もメモはないようです。');
	  }
});

app.intent('recording', conv => {
        conv.close('走行距離アプリへようこそ');
	connection.query({
		  sql: 'SELECT * FROM `usertest3` WHERE `num` >= ?',
		  timeout: 40000, // 40s
		  values: [1]
	}, function (error, results, fields) {
		console.log(results);
		console.log(fields);
	});
});

app.intent('recording/add', conv => {
	  const inputText = conv.query;
	  conv.close(`${inputText}、ですね。覚えておきます。`);
});

app.intent('refer/confirm to remove/yes', conv => {
	  const list = conv.user.storage.list;
	  conv.user.storage.list = list.slice(1);
	  conv.close('メモを消去します！ではまた。');
});
app.intent('refer/confirm to remove/no', conv => {
	  conv.close('まだ覚えておきますね。ではまた。');
});


exports.monthlyrunride = functions.https.onRequest(app);
// // Create and Deploy Your First Cloud Functions
// // https://firebase.google.com/docs/functions/write-firebase-functions
//
// exports.helloWorld = functions.https.onRequest((request, response) => {
//  response.send("Hello from Firebase!");
// });
