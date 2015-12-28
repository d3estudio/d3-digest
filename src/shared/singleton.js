/**
 * Simple singleton helper class
 */
class Singleton {
    /**
     * Initialises a new instance of this singleton manager
     * @param  {Class}  cls     Class to be initialised/returned by `sharedInstance`
     * @return {Singleton}      A new Singleton manager object
     */
    constructor(cls) {
        this.Cls = cls;
    }

    /**
     * Returns the shared object instance defined by the class provided
     * to this manager.
     * @return {object}
     */
    sharedInstance() {
        if(!this.instance) {
            this.instance = new this.Cls();
        }
        return this.instance;
    }
}

module.exports = Singleton;
