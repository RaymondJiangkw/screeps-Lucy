/** @module lucy/patterns */

/**
 * Interface for classes that should be called `Done` explicitly at the end of tick.
 * 
 * @interface
 */
function Doner() {}
/**
 * @returns {boolean}
 */
Doner.prototype.IsDone = false;
/**
 * Must be called at the end of tick.
 */
Doner.prototype.Done() = function() {
    console.log(`<p style="color : red; display: inline;">Interface Doner: \`Done\` called before being implemented.</p>`);
}