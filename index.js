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

const io = new Server({ cors: {
    origin: "http://localhost:4200",
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
let worker;

mediasoup.observer.on("newworker", (worker) => {
  console.log("new worker created [pid:%d]", worker.pid);
});

createWorker = async ()=> {
  worker = await mediasoup.createWorker({
    logLevel: logLevel,
    logTags: logTags,
  });
  worker.on('died', error => {
    console.error('mediasoup worker has died');
    console.log(error);
    setTimeout(() => process.exit(1), 2000);
  });
  worker.observer.on("newrouter", (router) => {
    console.log("new router created [id:%s]", router.id);
  });
  worker.observer.on("newwebrtcserverr", (webrtcServer) => {
    console.log("new webRTC server created ");
  });

  return worker;
}

const createRouter = async () => {
  let routerLocal = await worker.createRouter({ mediaCodecs });
  console.log("Router has been created");
  routerLocal.observer.on("newtransport", (transport) => {
    console.log("new transport created [id:%s]", transport.id);
  });
  return routerLocal;
}

createWebRtcTransport = async (roomID) => {
  const webRtcTransport_options = {
    listenInfos: [
      {
        protocol:"tcp",
        ip: '0.0.0.0',
        announcedAddress:'127.0.0.1' 
      }
    ],
  }
  router = getRouter(roomID);
  let transport = await router.createWebRtcTransport(webRtcTransport_options);
  console.log(`transport id: ${transport.id}`);

  transport.on('dtlsstatechange', dtlsState => {
    console.log("dtlsstatechange event to %s", dtlsState);
    if (dtlsState === 'closed') {
      console.log("closing transport");
      transport.close();
    }
  });
  transport.on("icestatechange", (iceState) => {
    console.log("ICE state changed to %s", iceState);
  });
  transport.on('close', () => {
    console.log('transport closed on close event');
  });
  transport.observer.on("newproducer", (producer) => {
    console.log("new producer created [id:%s]", producer.id);
  });
  transport.observer.on("newconsumer", (consumer) => {
    console.log("new consumer created [id:%s]", consumer.id);
  });

  return transport;
}

  io.on("connection", socket => {
    let peerID;
    console.log("A new user has joined socket id : ",socket.id);
    socket.emit("connection-success", "Connected with Voice server succesfully");

    socket.on("create-voice-room", async ({roomID, username}) => {
      let router  = await createRouter();
      initializeRoom(roomID, router);
      peerID = socket.id + username;
      joinPeer2Room(roomID, peerID, username);
      socket.join(roomID);
      socket.emit("rtp-capabilities-router", (router.rtpCapabilities));
    });

    socket.on("join-voice-room", ({roomID, username}) => {
      const router = getRouter(roomID);
      peerID = socket.id + username;
      joinPeer2Room(roomID, peerID, username);
      socket.join(roomID);
      socket.emit("rtp-capabilities-router", (router.rtpCapabilities));
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
      console.log("created web rtc transport ");
      socket.emit("transport-params", ({params, paramsConsumer}));
    });

    socket.on("transport-connect",  async ({ dtlsParameters, roomID, username}) => {
      let transport = getSendTransport(roomID, username);
      await transport.connect({dtlsParameters});
      console.log("transport producer connect done on dtls params");
    });

    socket.on("transport-consumer-connect",  async ({ dtlsParameters, roomID, username}) => {
      let transport = getRecvTransport(roomID, username);
      await transport.connect({dtlsParameters});
      console.log("transport reciever connect done on dtls params");
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
      console.log('Producer added. ID: ', producer.id, producer.kind)
      producer.on('transportclose', () => {
        console.log('transport for this producer CLOSED ' + username);
        producer.close()
      });
      producer.on("trace", (trace) => {
        console.log("trace data")
        console.log(trace);
      });
      socket.emit("prodcuer-data", ({id:producer.id, producerList}));
      socket.to(roomID).emit("new-producer", (producer.id));
    });

    socket.on("consume",  async ({ rtpCapabilities, roomID, username, producerID}) => {
      console.log("inisde consume");
      let router = getRouter(roomID);
      console.log("room", roomID, router, username, producerID);
      console.log("boolean",router.canConsume({
        producerId: producerID,
        rtpCapabilities
      }));
      if (router.canConsume({
        producerId: producerID,
        rtpCapabilities
      })) {
        console.log("yes router can consume. Producer id : ", producerID);
        let transport  = getRecvTransport(roomID, username);
        let consumer = await transport.consume({
          producerId: producerID,
          rtpCapabilities,
          paused: true,
        });
        console.log("consumer created");
        addConsumer(roomID, username, consumer);
        consumer.on('transportclose', () => {
          console.log('transport close from consumer: ',username);
        });
        consumer.on('producerclose', () => {
          console.log('producer of consumer closed: ', username);
        });
        consumer.on("trace", (trace) => {
          console.log(trace);
        });
        const params = {
          id: consumer.id,
          producerId: producerID,
          kind: consumer.kind,
          rtpParameters: consumer.rtpParameters,
        }
       socket.emit("consumer-params", (params));
      }
    });

    socket.on('consumer-resume', async ({roomID, username, consumerID}) => {
      console.log('consumer resume');
      consumer = getConsumer(roomID, username, consumerID)
      await consumer.resume();
    });
   
    socket.on("disconnect", reason => {
      console.log("user disconnected..");
      console.log("reason :" + reason);
    });
  });

console.log("Creating worker...");
worker = createWorker();
console.log("Listening on port: 3001....");
io.listen(3001);