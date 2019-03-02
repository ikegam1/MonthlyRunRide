'use strict';

const functions = require('firebase-functions'); 
const { dialogflow, SimpleResponse, SignIn } = require('actions-on-google'); 
const {WebhookClient} = require('dialogflow-fulfillment'); 
const {Card, Suggestion} = require('dialogflow-fulfillment'); 
const dateformat= require('dateformat');
const config = require('./.env.json'); 
const CLIENT_ID = config.client_id; 
const mysql = require('promise-mysql'); 
const moment = require('moment-timezone');
moment.tz.setDefault('Asia/Tokyo');
var toDay = moment(); 
var userId = ''; 
var sportsType = 'run';

// MySQLとのコネクションの作成 
const connection = mysql.createPool({
    socketPath: "/cloudsql/" + config.mysql.sock,
    user: config.mysql.user,
    database: config.mysql.db,
    password: config.mysql.pw
});

// 接続 //connection.connect();

const app = dialogflow({
	  'Authorization': config.secret,
	  clientId: CLIENT_ID,
})

function getUserId(conv){
    return conv.user.storage.userId;
}

function getActivityKm(value){
    let _m = toDay.format("M");
    return connection.query("SELECT sum(km) as total, count(km) as cnt FROM activities where uuid = ? and MONTH(rec_date) = ? and del_flg = 0", [ userId, _m ]).then(function(rows) {
	return rows[0];
    }).catch(function(err){
	console.log(err);
    });
}

function checkUUID(_userId){
    return connection.query("SELECT uuid FROM users where ? and del_flg = 0", {uuid: _userId}).then(function (rows) {
	return rows;
    }).catch(function(err){
	console.log(err);
    });
}


function newUUID(_rows){
    if(_rows.length > 0){
	return 1;
    }

    return connection.query("INSERT INTO users set ?", {uuid: userId, metric: 'km'}).then(function (result) {
	return result;
    }).catch(function(err){
	console.log(err);
    });

}

function insActivity(_data){
    return connection.query("INSERT INTO activities set ?", _data).then(function (result) {
	return result;
    }).catch(function(err){
	console.log(err);
    });
}

function selActivity(_date){
    let _d = moment(_date).format('YYYY-MM-DD');
    console.log(userId + '/' + _date + '/' + _d);
    return connection.query("SELECT sum(km) as total, sports_type FROM activities where uuid = ? and CAST(rec_date as DATE) = ? and del_flg = 0 group by sports_type ", [ userId, _d ]).then(function(rows) {
        console.log(rows);
	return rows;
    }).catch(function(err){
	console.log(err);
    });
}

function selActivityFromM(_y, _m){
    return connection.query("SELECT sum(km) as total, sports_type FROM activities where uuid = ? and YEAR(rec_date) = ? and MONTH(rec_date) = ? and del_flg = 0 group by sports_type ", [ userId, _y, _m ]).then(function(rows) {
	return rows;
    }).catch(function(err){
	console.log(err);
    });
}

function delActivity(_date){
    _date = moment(_date).format('YYYY-MM-DD');
    return connection.query("UPDATE activities set del_flg = 1 WHERE CAST(rec_date as DATE) = ? ", _date).then(function (result) {
	return result;
    }).catch(function(err){
	console.log(err);
    });
}

function delActivityCansel(_date){
    _date = moment(_date).format('YYYY-MM-DD');
    return connection.query("UPDATE activities set del_flg = 0 WHERE CAST(rec_date as DATE) = ? ORDER BY created_dt DESC LIMIT 1", _date).then(function (result) {
	return result;
    }).catch(function(err){
	console.log(err);
    });
}


app.intent('del Default Welcome Intent', conv => {
     conv.ask(new SignIn('To get your account detail'));
});

app.intent('del Get SignIn', (conv, params, signin) => {
	console.log(signin.status);
});

app.intent('Default Welcome Intent', conv => {
	  userId = conv.user.id;
          let _checkuuid = checkUUID(userId);
	  console.log(`uuid: ${userId}`)
	  if(userId.length < 14){
		  let _uuid = require('node-uuid');
		  userId = _uuid.v4();
	          let ssml = `<speak>月間走行距離アプリへようこそ！匿名ユーザーの場合は記録が保存されません。<emphasis level="strong">走行を記録</emphasis><break />と言ってください。</speak>`;
	          conv.ask(ssml);
		  return;
          }
	  conv.user.storage.userId = userId;
          return _checkuuid.then(newUUID).then(getActivityKm).then(rows => {
              console.log(rows);
              if(rows.hasOwnProperty('total')){
		  let _km = Math.floor(rows['total'] * 100) / 100;
		  let _cnt = rows['cnt'];
	          let ssml = `<speak><prosody rate="105%" pitch="+2s" range="high">おつかれさまです！</prosody>今月は<prosody rate="115%"><emphasis>${_cnt}回</emphasis>のアクティビティで<emphasis>${_km}キロ</emphasis>走りました。</prosody><emphasis level="strong">走行を記録</emphasis><emphasis level="reduced">または</emphasis><emphasis level="strong">記録を聞く</emphasis><break />と言ってください。</speak>`;
	          conv.ask(ssml);
	      }else{
	          let ssml = `月間走行距離アプリへようこそ！<emphasis level="strong">走行を記録</emphasis><emphasis level="reduced">または</emphasis><emphasis level="strong">記録を聞く</emphasis><break />と言ってください。`;
	          conv.ask(ssml);
	      }
              return rows;
	  });
});

app.intent('typeselect', (conv, params) => {
	  sportsType = params['sports_type'];
	  conv.user.storage.sportsType = sportsType;
	  conv.contexts.set('typeselect', 1 ,params);
	  console.log(conv.contexts);
	  return ;
});

app.intent('recordingadd', (conv, params) => {
	  let _contexts = conv.contexts.get('typeselect');
	  if(_contexts){
	      console.log(_contexts);
              sportsType = _contexts.parameters.sports_type;
	      conv.contexts.set('typeselect',1,_contexts.parameters);
	  }
	  userId = getUserId(conv);
	  console.log(params);
	  let _metric;
	  let _km  = params['run_km'];
	  let _date = (params.hasOwnProperty('date'))? params['date'] : '';
	  if(params['run_metric'] === ''){
		  _metric = 'km';
          }else{
		  _metric = params['run_metric'];
          }
	  if(_metric === 'm' ){
		  _km = Math.floor(_km)/1000;
          }
	  if(parseInt(_km*10) <= 0){
		  conv.ask(`すみません。100メートル以上の距離を記録してください。`);
		  return ;
          }
	  if(_date.length === 0){
	      _date = moment().format('YYYY-MM-DD');
          }else{
	      _date = moment(_date).format('YYYY-MM-DD');
          }

	  let _data = {uuid: userId, sports_type: sportsType, km: parseFloat(_km), rec_date: _date};
          let _insActivity = insActivity(_data);
	  return _insActivity.then(rows => {
	      console.log(new Date());
	      console.log(moment().format('YYYY/MM/DD HH:MM:ss'));
	      console.log(toDay.format('YYYY-MM-DD'));
	      console.log(moment(_date).format('YYYY-MM-DD'));
              if(toDay.format('YYYY-MM-DD') === moment(_date).format('YYYY-MM-DD')){
	          let ssml = `<speak>記録しました。<break />昨日、${params['run_km']}${params['run_metric']}走った。のように記録すると他の日も記録できます。記録を聞くときは<emphasis level="strong">記録を聞く</emphasis>といってください。</speak>`;
	          conv.ask( ssml);
	      }else{
	          let ssml = `<speak>${sportsType}を${_km}${params['run_metric']}ですね。記録しました。記録を聞くときは<emphasis level="strong">記録を聞く</emphasis>といってください。</speak>`;
	          conv.ask( ssml);
	      }
              console.log(rows);
	      return rows;
	  });
});

app.intent('viewActivitySelect', (conv, params) => {
	  userId = getUserId(conv);
	  let date = (params.hasOwnProperty('date'))? params['date'] : '';
	  let year = (params.hasOwnProperty('year'))? params['year'] : '';
	  let month = (params.hasOwnProperty('month'))? params['month'] : '';
	  if (year === '') year = String(toDay.format("YYYY"));
	  if(date.length > 0){
	      let _selActivity = selActivity(date);
	      return _selActivity.then(rows => {
		  if(rows.length < 1) throw rows;
	          let _message = `<speak>${dateformat(date,'yyyy年m月d日')}の記録は`;
		  for( let _val of rows ){
		      if(_val['total'] > 0){
	                  _message = `${_message} ${_val['sports_type']}が${Math.floor(_val['total'] * 100) / 100}キロ<break />`;
		      }
		  }
                  if(moment().format('YYYY-MM-DD') === moment(date).format('YYYY-MM-DD')){
	              _message += `です。記録を消すときは<emphasis>今日の記録を削除</emphasis>と言ってください。</speak>`;
	          }else if(moment().add(-1,'days').format('YYYY-MM-DD') === moment(date).format('YYYY-MM-DD')){
	              _message += `です。記録を消すときは<emphasis>昨日の記録を削除</emphasis>と言ってください。</speak>`;
	          }else{
	              _message += `です。記録を消すときは<emphasis>${dateformat(date,'yyyy年m月d日')}の記録を削除</emphasis>と言ってください。</speak>`;
	          }
		  conv.ask(_message);
		  return rows;
	      }).catch(error => {
		  console.log(error);
		  conv.ask(`${dateformat(date,'yyyy年m月d日')}の記録がありませんでした`);
	      });
          }
	  if(parseInt(month) < 13 && parseInt(year) >= 2000){
	      let _selActivity = selActivityFromM(year, month);
	      return _selActivity.then(rows => {
		  if(rows.length < 1) throw rows;
	          let _message = `<speak>${year}年${month}月の記録は`;
		  for( let _val of rows ){
		      if(_val['total'] > 0){
	                  _message = `${_message} ${_val['sports_type']}が${Math.floor(_val['total'] * 100) / 100}キロメートル<break />`;
	              }
		  }
	          _message += `です。<emphasis level="strong">おわり</emphasis>というと終了できます。</speak>`;
		  conv.ask(_message);
		  return rows;
	      }).catch(error => {
		  conv.ask(`${year}年${month}月の記録がありませんでした`);
	      });
          }
	  conv.ask(`今年の1月1日、のように言ってください。`);
	  return;
});

app.intent('delActivity', (conv, params) => {
	  userId = getUserId(conv);
	  let date = params['date'];
	  let _delActivity = delActivity(date);
	  return _delActivity.then(res => {
	      let ssml = '';
              if(moment().format('YYYY-MM-DD') === moment(date).format('YYYY-MM-DD')){
	          ssml = `<speak>今日の記録を削除しました。削除を取り消したいときは、<emphasis>今日の削除を復活</emphasis>と言ってください</speak>`;
	      }else if(moment().add(-1,'days').format('YYYY-MM-DD') === moment(date).format('YYYY-MM-DD')){
	          ssml = `<speak>昨日の記録を削除しました。削除を取り消したいときは、<emphasis>昨日の削除を復活</emphasis>と言ってください</speak>`;
	      }else{
	          ssml = `<speak>${dateformat(date, 'yyyy年m月d日')}の記録を削除しました。削除を取り消したいときは、<emphasis>${dateformat(date,'yyyy年m月d日')}の削除を復活</emphasis>と言ってください</speak>`;
	      }
	      conv.ask(ssml);
	      return res;
	  }).catch(error => {
	      console.log(error);
	      conv.ask('なぜか削除できませんでした');
          });
});

app.intent('delActivityCancel', (conv, params) => {
	  userId = getUserId(conv);
	  let date = params['date'];
	  let _delActivityCansel = delActivity(date);
	  return _delActivityCansel.then(res => {
	      conv.ask(`${dateformat(date, 'yyyy年m月d日')}の記録削除を取り消しました`);
		  return res;
	  }).catch(error => {
		  conv.ask('ごめんなさい。取り消しに失敗しました');
          });
});

exports.monthlyrunride = functions.https.onRequest(app); 

