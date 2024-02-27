/* [LOGIING LABELS] *******
*  [INFO] - general inforamtion
*  [SKID] - socket id
*  [USER] - username of the interaction
*  [WRID] - worker id
*  [RTID] - router id
*  [TRID] - transport id
*  [DTLS] - transport param connection
*  [ICES] - ice candidate states
*  [TRAN] - related to transport
*  [TRAC] - related to trace event of prod/cons
*  [PROD] - related to producer
*  [CONS] - related to consumer
*  [RVAL] - return value of a nearby fucntion call
*  [EROR] - error log
*/
/*log it to the console */
const logItOnConsole = (message) => {
    console.log(message)
}
/* log it to file */
const logItOnFile = (message) => {
    console.log(message);
}

module.exports = {
    logItOnConsole,
    logItOnFile
}