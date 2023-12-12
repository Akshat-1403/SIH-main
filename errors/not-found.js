const { StatusCodes } = require("http-status-codes");
const CustomAPIError = require("./custom-api.js");

class NOT_FOUND extends CustomAPIError{
    constructor(message){
        super(messageStatusCodes.NOT_FOUND);
    }
};
module.exports = NOT_FOUND;