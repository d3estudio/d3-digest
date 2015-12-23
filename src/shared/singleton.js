class Singleton {
    constructor(cls) {
        this.Cls = cls;
    }

    sharedInstance() {
        if(!this.instance) {
            this.instance = new this.Cls();
        }
        return this.instance;
    }
}

module.exports = Singleton;
