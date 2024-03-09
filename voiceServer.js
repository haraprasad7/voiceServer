const { Server } = require("socket.io");
process.env.DEBUG = "mediasoup*";
const mediasoup = require('mediasoup');
const { initializeRoom, getRouter, joinPeer2Room,
  addTransports, getSendTransport, getRecvTransport,
  addProducer, 
  addConsumer,
  getConsumer,
  getProducerList,
  addToProducerList} = require("./utility/roomData");
const { logItOnConsole } = require("./utility/logging");

const io = new Server({ cors: {
    origin: "*",
    methods: ["GET", "POST"]
  }});

const mediaCodecs = [
  {
    kind: 'audio',
    mimeType: 'audio/opus',
    clockRate: 48000,
    channels: 2,
    preferredPayloadType: 120
  },
  {
    kind: 'video',
    mimeType: 'video/VP8',
    clockRate: 90000,
    parameters: {
      'x-google-start-bitrate': 1000,
    },
  },
]
const logLevel = 'debug';
const logTags = [
        'info',
        'ice',
        'dtls',
        'rtp',
        'srtp',
        'rtcp',
        // 'rtx',
        // 'bwe',
        // 'score',
        // 'simulcast',
        // 'svc'
      ];
const PORT = 3001;
const WEBRTC_TRANS_PROTOCOL= "tcp";
const IP = '0.0.0.0';
const ANNOUNCED_IP = '192.168.144.137';
const CONNECTION_SUCCESS =  "Connected with Voice server succesfully";
let worker;

mediasoup.observer.on("newworker", (worker) => {
  logItOnConsole("[INFO] new worker created [WRID] " + worker.pid);
});

createWorker = async ()=> {
  worker = await mediasoup.createWorker({
    logLevel: logLevel,
    logTags: logTags,
  });
  worker.on('died', error => {
    logItOnConsole(error);
    logItOnConsole("[EROR] worker died shutting down server");
    setTimeout(() => process.exit(1), 2000);
  });
  worker.observer.on("newrouter", (router) => {
    logItOnConsole("[INFO] new router created [RTID] " + router.id);
  });
  worker.observer.on("newwebrtcserverr", (webrtcServer) => {
    logItOnConsole("[INFO] new webRTC server created ");
  });
  return worker;
}

const createRouter = async () => {
  let routerLocal = await worker.createRouter({ mediaCodecs });
  logItOnConsole("[INFO] Router has been created");
  routerLocal.observer.on("newtransport", (transport) => {
    logItOnConsole("[INFO] new transport created [TRID] " +  transport.id);
  });
  return routerLocal;
}

createWebRtcTransport = async (roomID) => {
  const webRtcTransport_options = {
    listenInfos: [
      {
        protocol:WEBRTC_TRANS_PROTOCOL,
        ip: IP,
        announcedAddress:ANNOUNCED_IP 
      }
    ],
  }
  router = getRouter(roomID);
  let transport = await router.createWebRtcTransport(webRtcTransport_options);
  logItOnConsole(`[INFO] transport id [TRID]: ${transport.id}`);

  transport.on('dtlsstatechange', dtlsState => {
    logItOnConsole("[INFO] [DTLS] dtlsstatechange event to " + dtlsState);
    if (dtlsState === 'closed') {
      logItOnConsole("[INFO] [DTLS] closing transport");
      transport.close();
    }
  });
  transport.on("icestatechange", (iceState) => {
    logItOnConsole("[INFO] [ICES] ICE state changed to " + iceState);
  });
  transport.on('close', () => {
    logItOnConsole('[INFO] transport closed on close event');
  });
  transport.observer.on("newproducer", (producer) => {
    logItOnConsole("[INFO] new producer created  [PROD] [PRID] " + producer.id);
  });
  transport.observer.on("newconsumer", (consumer) => {
    logItOnConsole("[INFO] new consumer created [CONS] [CNID] " + consumer.id);
  });
  return transport;
}

  io.on("connection", socket => {
    let peerID;
    logItOnConsole("[INFO] A new user has joined socket id [SKID] : " + socket.id);
    socket.emit("connection-success",CONNECTION_SUCCESS);

    socket.on("create-voice-room", async ({roomID, username}) => {
      let router  = await createRouter();
      initializeRoom(roomID, router);
      peerID = socket.id + username;
      joinPeer2Room(roomID, peerID, username);
      socket.join(roomID);
      socket.emit("rtp-capabilities-router", (router.rtpCapabilities));
      logItOnConsole(`[INFO] voice room created [RMID] ${roomID} [USER] ${username}`);
    });

    socket.on("join-voice-room", ({roomID, username}) => {
      const router = getRouter(roomID);
      peerID = socket.id + username;
      joinPeer2Room(roomID, peerID, username);
      socket.join(roomID);
      socket.emit("rtp-capabilities-router", (router.rtpCapabilities));
      logItOnConsole(`[INFO] joined voice room [RMID] ${roomID} [USER] ${username}`);
    });

    socket.on("create-webrtc-transport", async ({roomID, username}) => {
       let transport =  await createWebRtcTransport(roomID);
       let transportConsumer = await createWebRtcTransport(roomID);
       let params = {
        id: transport.id,
        iceParameters: transport.iceParameters,
        iceCandidates: transport.iceCandidates,
        dtlsParameters: transport.dtlsParameters,
      }
      let paramsConsumer = {
        id: transportConsumer.id,
        iceParameters: transportConsumer.iceParameters,
        iceCandidates: transportConsumer.iceCandidates,
        dtlsParameters: transportConsumer.dtlsParameters,
      }
      addTransports(roomID, username, transport, transportConsumer);
      logItOnConsole(`[INFO] transports created [RMID] ${roomID} [USER] ${username}`);
      socket.emit("transport-params", ({params, paramsConsumer}));
    });

    socket.on("transport-connect",  async ({ dtlsParameters, roomID, username}) => {
      let transport = getSendTransport(roomID, username);
      await transport.connect({dtlsParameters});
      logItOnConsole(`[INFO] [DTLS] producer transport connect [RMID] ${roomID} [USER] ${username}`);
    });

    socket.on("transport-consumer-connect",  async ({ dtlsParameters, roomID, username}) => {
      let transport = getRecvTransport(roomID, username);
      await transport.connect({dtlsParameters});
      logItOnConsole(`[INFO] [DTLS] producer transport connect [RMID] ${roomID} [USER] ${username}`);
    });

    socket.on("transport-produce", async ({kind, rtpParameters, roomID, username}) => {
      transport = getSendTransport(roomID, username);
      producer = await transport.produce({
      kind,
      rtpParameters,
      });
      let producerList = [...getProducerList(roomID)];
      addToProducerList(roomID, producer.id);
      addProducer(roomID, username, producer);
      logItOnConsole(`[INFO] producer created [PROD] ${producer.id} [RMID] ${roomID} [USER] ${username}`);
      producer.on('transportclose', () => {
        logItOnConsole('[INFO] transport for this producer CLOSED [USER] ' + username);
        producer.close()
      });
      producer.on("trace", (trace) => {
        logItOnConsole("[INFO] [TRAC] trace data")
      });
      socket.emit("prodcuer-data", ({id:producer.id, producerList}));
      socket.to(roomID).emit("new-producer", (producer.id));
      logItOnConsole(`[INFO] producer list sent [PROD]` + JSON.stringify(producerList) +
       `[RMID] ${roomID} [USER] ${username}`);
    });

    socket.on("consume",  async ({ rtpCapabilities, roomID, username, producerID}) => {
      let router = getRouter(roomID);
      if (router.canConsume({
        producerId: producerID,
        rtpCapabilities
      })) {
        let transport  = getRecvTransport(roomID, username);
        let consumer = await transport.consume({
          producerId: producerID,
          rtpCapabilities,
          paused: true,
        });
        logItOnConsole(`[INFO] consumer created [CONS] ${consumer.id} [RMID] ${roomID} [USER] ${username}`);
        addConsumer(roomID, username, consumer);
        consumer.on('transportclose', () => {
          logItOnConsole('[INFO] transport close from consumer [USER] ',username);
        });
        consumer.on('producerclose', () => {
          logItOnConsole('[INFO] producer of consumer closed [USER] ', username);
        });
        consumer.on("trace", (trace) => {
          logItOnConsole("[INFO] [TRAC] trace data");
        });
        const params = {
          id: consumer.id,
          producerId: producerID,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }
       socket.emit("consumer-params", (params));
       logItOnConsole(`[INFO] consumer params emited [CONS] ${consumer.id} [PROD] ${producerID} [USER] ${username}`);
      }
    });

    socket.on('consumer-resume', async ({roomID, username, consumerID}) => {
      consumer = getConsumer(roomID, username, consumerID)
      await consumer.resume();
      logItOnConsole(`[INFO] consumer resumed [CONS] ${consumerID} [RMID] ${roomID} [USER] ${username}`);
    });
   
    socket.on("disconnect", reason => {
      logItOnConsole("[INFO] disconnect [RVAL] " + reason);
    });
  });

logItOnConsole("[INFO] Creating worker...");
worker = createWorker();
logItOnConsole("[INFO] Listening on port: " + PORT);
io.listen(PORT);