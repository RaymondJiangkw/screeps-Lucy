/**
 * Adapted From
 * @author HoPGoldy
 * @source https://github.com/HoPGoldy/my-screeps-ai/blob/dev/src/modules/framework/index.ts
 * 
 * @typedef { () => any } AnyCallback 生命周期回调
 * @typedef { (next : () => any) => any } ErrorCatcher 异常捕获方法，调用 next 可以执行实际业务逻辑
 * @typedef { AnyClass } TargetClass 要挂载到的类
 * @typedef { AnyClass } ExtensionClass 包含拓展的类
 * @typedef { () => void } MountFunction 执行挂载的函数
 * @typedef { {[key : string] : any} } AnyClass
 * @typedef { {id : number, callback : AnyCallback}[] _CallbackStore }
 * @typedef { {"born"? : _CallbackStore, "init"? : _CallbackStore , "reset"? : _CallbackStore, "beforeTickStart"? : _CallbackStore, "tickStart"? : _CallbackStore, "afterWork"? : _CallbackStore, "tickEnd"? : _CallbackStore} } CallbackStore
 * @typedef { {"born"? : AnyCallback, "init"? : AnyCallback, "reset"? : AnyCallback, "beforeTickStart"? : AnyCallback, "tickStart"? : AnyCallback, "afterWork"? : AnyCallback, "tickEnd"? : AnyCallback} } AppLifecycleCallbacks
 * @typedef { {[key : string] : any} } AnyHashMap
 * @typedef { {label : string, init : number, fetch : () => number, fetchParams? : any[], func : (newNumber : number, oldNumber : number, ...args : any[]) => void, funcParams? : any[]} } MonitorEntry 数值监视单件
 */
const BOT_NAME_SUFFIX = 'Framework';
const DEFAULT_BOT_NAME = `Lucy_${BOT_NAME_SUFFIX}`;
class App {
    /**
     * @private
     * 初始化属性
     */
    init() {
        /**
         * 该bot的名称
         * @type {string}
         * @public
         */
        this.name = DEFAULT_BOT_NAME;
        /**
         * 通过中间件包装过的回调
         * @type {AppLifecycleCallbacks}
         * @private
         */
        this.lifecycleCallbacks = {
            born : [], init : [], reset : [], beforeTickStart : [], tickStart : [], afterWork : [], tickEnd: []
        };
        /**
         * 用于标识下个on所注册回调的索引 会在on执行后自增
         * @type {number}
         * @private
         */
        this.callbackIndex = 0;
        /**
         * 默认的异常捕获
         * @type {ErrorCatcher}
         * @private
         */
        this._catcher = next => {
            // try {
                next();
            // } catch (e) {
            //    console.log(`<span style="color:#ef9a9a">${e}</span>`);
            //    Game.notify(e);
            //}
        };
        /**
         * 执行挂载的函数列表
         * @type {MountFunction[]}
         * @private
         */
        this.mountFunctions = [];
        /**
         * 数值监视事件列表
         * @type {MonitorEntry[]}
         * @private
         */
        this.monitorLists = [];
    }
    /**
     * 设置新的异常捕获器
     * 不允许设置为空
     * 
     * @danger 请务必执行 next 方法！不然框架将无法正常使用
     * @param {ErrorCatcher} newCatcher
     */
    set catcher(newCatcher) {
        if (!newCatcher) return;
        this._catcher = newCatcher;
    }
    /**
     * 设置生命周期回调
     * 同一生命周期阶段可以设置多次，在执行时会按照设置的顺序依次执行
     * 
     * @param {AppLifecycleCallbacks} callbacks 要执行的生命周期回调
     * @returns 该组回调的唯一索引，用于取消监听
     */
    on(callbacks) {
        const id = this.getCallbackIndex();
        // 保存返回回调并分配唯一索引 （不同分组间唯一）
        Object.keys(callbacks).map(type => {
            this.lifecycleCallbacks[type].push({id, callback : callbacks[type]});
        });
        return id;
    }
    /**
     * 注册数值监视事件，主要用来响应GCL、GPL变化
     * @param {MonitorEntry} entry
     */
    monitor(entry) {
        // 初始化监视单件中参数列表
        if (!entry.fetchParams) entry.fetchParams = [];
        if (!entry.funcParams) entry.funcParams = [];
        Memory[this.name]["monitored"][entry.label] = entry.init;
        this.monitorLists.push(entry);
    }
    /**
     * 关闭生命周期回调监听
     * 
     * @param {number} deleteTarget 要取消监听的分组索引
     * @returns {App}
     */
    close(deleteTarget) {
        // 遍历所有的回调
        Object.values(this.lifecycleCallbacks).map(callbackList => {
            // 查找每个阶段，找到对应的id并删除
            callbackList.find(({id}, index) => {
                if (id !== deleteTarget) return;
                callbackList.splice(index, 1);
                return true;
            });
        });
        return this;
    }
    /**
     * 获取唯一的索引
     * @returns {number}
     */
    getCallbackIndex() {
        return this.callbackIndex ++;
    }
    /**
     * 挂载原型拓展
     * @param {TargetClass | [TargetClass, ExtensionClass][] | MountFunction} param0
     * @param {ExtensionClass} [param1]
     */
    mount(param0, param1) {
        // 进行挂载
        if (arguments.length === 2) {
            Object.getOwnPropertyNames(param1.prototype).map(prop => {
                param0.prototype[prop] = param1.prototype[prop];
            });
        } else if (arguments.length === 1 && Array.isArray(param0)) {
            for (const [targetClass, extensionClass] of param0) this.mount(targetClass, extensionClass);
        } else if (arguments.length === 1 && typeof param0 === "function") {
            this.mountFunctions.push(param0);
        }
        return this;
    }
    /**
     * 执行指定生命周期阶段回调
     * @param {keyof AppLifecycleCallbacks} lifecycleType type 要执行的生命周期回调名称
     */
    execLifecycleCallback(lifecycleType) {
        // 遍历执行 work
        for (const { callback } of this.lifecycleCallbacks[lifecycleType]) {
            this._catcher(callback);
        }
    }
    /**
     * 执行指定的数值监视事件
     * @param {MonitorEntry} entry
     */
    execMonitor(entry) {
        const number = entry.fetch( ...entry.fetchParams );
        if (number !== Memory[this.name]["monitored"][entry.label]) {
            // 更新并触发事件
            this._catcher(entry.func.bind(undefined, number, Memory[this.name]["monitored"][entry.label], ...entry.funcParams ));
            Memory[this.name]["monitored"][entry.label] = number;
        }
    }
    /**
     * 当全局重置时触发
     * @private
     */
    onGlobalReset() {
        // 执行所有执行挂载的函数
        this.mountFunctions.forEach(f => f());
        // 执行对于 Game 的即时修改
        this.execLifecycleCallback("beforeTickStart");
        // 执行全局变量初始化
        this.execLifecycleCallback("init");
        this.execLifecycleCallback("reset");
        global._mountComplete = true;
        console.log(`<p style="display:inline;color:red;">[mount]</p> Remount successfully.`);
        // 检查是否是第一次全局重置
        if (!Memory[this.name].notOnBorn) {
            this.execLifecycleCallback('born');
            Memory[this.name].notOnBorn = true;
        }
    }
    /**
     * 运行 bot
     */
    run() {
        if (!global._mountComplete) this.onGlobalReset();
        // 执行对于 Game 的即时修改, `beforeTickStart` 会在 `onGlobalReset` 中执行一次
        else this.execLifecycleCallback("beforeTickStart");
        
        // 执行数值监视事件
        this.monitorLists.forEach(entry => this.execMonitor(entry));

        this.execLifecycleCallback("tickStart");

        this.execLifecycleCallback("afterWork");
        this.execLifecycleCallback("tickEnd");

        return this;
    }
    /**
     * 创建 Bot 实例
     * @param {{name? : string, mountList? : [AnyClass, AnyClass][]}} param0 opt 配置项, 包含 bot 的名字和要挂载的原型列表
     */
    constructor({name, mountList} = {}) {
        this.init();
        if (name) this.name = name + BOT_NAME_SUFFIX;
        if (mountList) mountList.map(group => this.mount(...group));
        if (!Memory[this.name]) Memory[this.name] = {
            // 数值监视缓存
            "monitored" : {}
        };
    }
}

module.exports = {
    App : App
};