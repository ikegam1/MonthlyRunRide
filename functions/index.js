'use strict';

const functions = require('firebase-functions');
const { dialogflow, SignIn } = require('actions-on-google');
const {WebhookClient} = require('dialogflow-fulfillment');
const {Card, Suggestion} = require('dialogflow-fulfillment');
const CLIENT_ID = '851188982183-i2jb4rq6qnuardi3v2sfs1500n1onnra.apps.googleusercontent.com'
const config = require('./.env.json');
const mysql = require('mysql');
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
	  if (conv.user.last && conv.user.last.seen) {
	      const list = conv.user.storage.list || [];
	      const keepingMessage = (list.length > 1 && `${list.length}個のメモを覚えてますよ。`)
	        || (list.length === 1 && `1個メモを記録しています。`)
	        '';
	      conv.ask(`おかえりなさい！${keepingMessage || ''}どうしましょう？メモを聞く場合は、メモ参照、メモする場合は、メモして、と言ってください。`);
	  } else {
	      conv.ask(`はじめまして！メモアプリへようこそ！どうしましょう？`);
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
