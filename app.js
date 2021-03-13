const utils = require('./lib/utils');

const dotenv = require('dotenv').config();
const session = require('express-session');
const express = require('express');
const google = require('googleapis').google;
const crypto = require('crypto');
const { runInNewContext } = require('vm');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/views'))
app.use(
    session({
        secret: process.env.SESSION_ID_SECRET,
        resave: false,
        saveUninitialized: false,
        cookie: {
            maxAge: 60 * 60 * 1000 // 1時間
        }
    })
);

const oauth2Client = new google.auth.OAuth2(process.env.GOOGLEDRIVE_CLIENT_ID, process.env.GOOGLEDRIVE_CLIENT_SECRET);

// Google Drive APIに関する定数
SCOPE = [
    "https://www.googleapis.com/auth/drive.file",
];

app.get('/', (req, res) => {
    res.redirect(`${process.env.NETWORK_URI}/authorization`);
});


app.get('/authorization', (req, res) => {
    // すでにアクセストークンがあれば、アップロード画面へ遷移
    if (req.session.accessToken) {
        return;
    }

    req.session.state = utils.urlSafeRandomChars(256);
    req.session.codeVerifier = utils.urlSafeRandomChars(256);
    const codeChallenge = utils.getCodeChallengeFromCodeVerifier(req.session.codeVerifier);

    const authUrl = oauth2Client.generateAuthUrl({
        access_type: 'offline', // リフレッシュトークンをクエリに含めてもらう
        scope: SCOPE,
        state: req.session.state,
        code_challenge: codeChallenge,
        code_challenge_method: 'S256',
        redirect_uri: `${process.env.NETWORK_URI}/callback`,
        prompt: 'consent', // 毎回同意を求める
    });
    
    res.redirect(authUrl);
    return;
});

app.get('/callback', (req, res) => {
    // stateが一致しない or 認可コードが取得できなかった場合、セッション変数をリセットして、トップページにリダイレクト
    if (req.query.state !== req.session.state || !req.query.code) {
        req.session.state = undefined;
        req.session.codeVerifier = undefined;
        req.session.accessToken = undefined;
        req.session.refreshTken = undefined;
        res.redirect(`${process.env.NETWORK_URI}`);
        return;
    }
    
    // tokenを取得しにいく
    const getTokenOptions = {
        code: req.query.code,
        codeVerifier: req.session.codeVerifier,
        redirect_uri: `${process.env.NETWORK_URI}/callback`,
    }
    oauth2Client.getToken(getTokenOptions, function(err, tokens) {

        if (tokens) {
            req.session.accessToken = tokens.access_token;
            req.session.refreshTken = tokens.refresh_token;

            res.redirect(`${process.env.NETWORK_URI}/uploadPage`);
            return;
        }
        else {
            req.session.state = undefined;
            req.session.codeVerifier = undefined;
            req.session.accessToken = undefined;
            req.session.refreshTken = undefined;
            res.redirect(`${process.env.NETWORK_URI}/error`);
            return;
        }
    });
});

app.get('/uploadPage', (req, res) => {
    res.render('upload.ejs');
});

app.get('/error', (req, res) => {
    res.render('error.ejs');
});

app.post('/uploadFile', (req, res) => {
    return;
});

app.listen(process.env.SERVER_PORT);