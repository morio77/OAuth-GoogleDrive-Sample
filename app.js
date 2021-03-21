const utils = require('./lib/utils');

const dotenv = require('dotenv').config();
const session = require('express-session');
const express = require('express');
const google = require('googleapis').google;
const crypto = require('crypto');
const fs = require("fs");
const path = require('path');
const { digitalassetlinks } = require('googleapis/build/src/apis/digitalassetlinks');

const app = express();
app.set('view engine', 'ejs');
app.use(express.static(__dirname + '/views'));
app.use(express.static(__dirname + '/styles'));
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
        res.redirect(`${process.env.NETWORK_URI}/uploadPage`);
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
        req.session.refreshToken = undefined;
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
            req.session.refreshToken = tokens.refresh_token;

            res.redirect(`${process.env.NETWORK_URI}/uploadPage`);
            return;
        }
        else {
            req.session.state = undefined;
            req.session.codeVerifier = undefined;
            req.session.accessToken = undefined;
            req.session.refreshToken = undefined;
            res.redirect(`${process.env.NETWORK_URI}/error`);
            return;
        }
    });
});

app.get('/uploadPage', (req, res) => {
    res.render('upload.ejs');
});

app.get('/uploadFile', async (req, res) => {

    // Googleドライブにファイルをアップロードする関数
    async function uploadFile(driveAPIClient, fileMetadata, media) {
        const res = await drive.files.create({
            resource: fileMetadata,
            media: media,
        });
        return res.status === 200 ? true : false;
    }

    // アップロードするファイルのmeta情報などを定義しておく
    const fileMetadata = {
        'name': req.query.fileName
    };
    const media = {
        mimeType: 'image/' + path.extname(req.query.fileName),
        body: fs.createReadStream('./views/images/' + req.query.fileName)
    };
    
    // セッション変数に含まれているアクセストークンを使ってドライブAPIクライアントを作成する
    const oauth2Client = new google.auth.OAuth2(process.env.GOOGLEDRIVE_CLIENT_ID, process.env.GOOGLEDRIVE_CLIENT_SECRET);
    oauth2Client.setCredentials({
        access_token: req.session.accessToken,
        refresh_token: req.session.refreshToken,
    });
    const driveAPIClient = google.drive({version: 'v3', auth: oauth2Client});

    // アップロードする。失敗したら、トークンを更新してリトライする
    if (!await uploadFile(driveAPIClient, fileMetadata, media)) {
        oauth2Client.refreshAccessToken(async function(err, tokens) {
            if (err) { // トークンのリフレッシュに失敗したらエラー画面へ
                console.log(err);
                res.redirect(`${process.env.NETWORK_URI}/error`);
            }
            else { // トークンのリフレッシュに成功したら、新たなドライブAPIクライアントでリトライする
                req.session.accessToken = tokens.access_token;
                req.session.refreshToken = tokens.refresh_token;
                oauth2Client.setCredentials(tokens);
                const driveAPIClient = google.drive({version: 'v3', auth: oauth2Client});
                // アップロードする。失敗したら、保持するトークンなどを破棄してエラー画面へ
                if (!await uploadFile(driveAPIClient, fileMetadata, media)) {
                    req.session.state = undefined;
                    req.session.codeVerifier = undefined;
                    req.session.accessToken = undefined;
                    req.session.refreshToken = undefined;
                    res.redirect(`${process.env.NETWORK_URI}/error`);
                }
            }
        });
    }
    return;
});

app.get('/error', (req, res) => {
    res.render('error.ejs');
});

app.listen(process.env.SERVER_PORT);