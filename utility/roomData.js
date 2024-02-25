const rooms = new Map();
const peersMap = new Map();

const createRoomObject = () => {
    return ({
        router:{},
        roomID:'',
        peers:{},
        producers:[]
    });
}

const createPeerObject = () => {
    return ({
        username:'',
        socketID:'',
        roomID:'',
        sendTransport:{},
        recvTransport:{},
        producer:{},
        consumers:[],
    })

}

const initializeRoom = (roomID, router) => {
    roomData = createRoomObject();
    roomData.router = router;
    roomData.roomID = roomID;
    rooms.set(roomID, roomData);
}

const joinPeer2Room = (roomID, socketID, username, peerID) => {
    peerData = createPeerObject();
    peerData.roomID = roomID;
    peerData.username = username;
    peerData.socketID = socketID;
    peersMap.set(peerID, peerData);
    rooms.get(roomID).peers[username] = peerData;
}

const getRouter = (roomID) => {
    return rooms.get(roomID).router;
}

const addTransports = (roomID, username, sendTransport, recvTransport) => {
    rooms.get(roomID).peers[username].sendTransport = sendTransport;
    rooms.get(roomID).peers[username].recvTransport = recvTransport;
}

const getSendTransport = (roomID, username) => {
    return rooms.get(roomID).peers[username].sendTransport;
}
   

const getRecvTransport = (roomID, username) => {
    return rooms.get(roomID).peers[username].recvTransport;
}

const addProducer = (roomID, username, producer) => {
    rooms.get(roomID).peers[username].producer = producer;
}

const getProducer = (roomID, username) => {
   return rooms.get(roomID).peers[username].producer;
}

const addToProducerList = (roomID, producerID) => {
    rooms.get(roomID).producers.push(producerID);
}

const getProducerList = (roomID) => {
    return rooms.get(roomID).producers;
}

const addConsumer = (roomID, username, consumer) => {
    rooms.get(roomID).peers[username].consumers.push(consumer);
}

const getConsumer = (roomID, username, consumerID) => {
    return rooms.get(roomID).peers[username].consumers.find(data => data.id === consumerID);
}

module.exports = {
    initializeRoom, getRouter, joinPeer2Room,
  addTransports, getSendTransport, getRecvTransport,
  addProducer, 
  addConsumer,
  getConsumer,
  addToProducerList,
  getProducerList,
}

