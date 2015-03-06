module.exports = function(req, res) {
    return {
        status: 200,
        headers: {},
        body: ['Welcome to our Selenium Grid. Point your tests to the /wd/hub url.']
    }
};
