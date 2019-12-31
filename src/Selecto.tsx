import Component from "@egjs/component";
import Dragger, { OnDrag } from "@daybrush/drag";
import { InjectResult } from "css-styled";
import { Properties } from "framework-utils";
import { isObject, camelize, IObject } from "@daybrush/utils";
import ChildrenDiffer, { diff, ChildrenDiffResult } from "@egjs/children-differ";
import KeyController from "keycon";
import { createElement, h, getClient, diffValue } from "./utils";
import { SelectoOptions, Rect, SelectoProperties, OnDragEvent, SelectoEvents } from "./types";
import { PROPERTIES, injector, CLASS_NAME } from "./consts";

/**
 * Selecto.js is a component that allows you to select elements in the drag area using the mouse or touch.
 * @sort 1
 * @extends eg.Component
 */
@Properties(PROPERTIES as any, (prototype, property) => {
    const attributes: IObject<any> = {
        enumerable: true,
        configurable: true,
        get() {
            return this.options[property];
        },
    };
    const setter = camelize(`set ${property}`);
    if (prototype[setter]) {
        attributes.set = function(value) {
            this[setter](value);
        };
    } else {
        attributes.set = function(value) {
            this.options[property] = value;
        };
    }
    Object.defineProperty(prototype, property, attributes);
})
class Selecto extends Component {
    public options: SelectoOptions;
    private target!: HTMLElement | SVGElement;
    private container!: HTMLElement;
    private dragger!: Dragger;
    private injectResult!: InjectResult;
    private selectedTargets: Array<HTMLElement | SVGElement> = [];
    private differ = new ChildrenDiffer<HTMLElement | SVGElement>();
    private keycon!: KeyController;
    /**
     *
     */
    constructor(
        options: Partial<SelectoOptions> = {},
    ) {
        super();
        this.target = options.target;
        this.container = options.container;
        this.options = {
            target: null,
            container: null,
            dragContainer: null,
            selectableTargets: [],
            selectByClick: true,
            selectFromInside: true,
            hitRate: 100,
            continueSelect: false,
            toggleContinueSelect: null,
            keyContainer: null,
            ...options,
        };
        this.initElement();
        this.setKeyController();
    }
    /**
     * You can set the currently selected targets.
     */
    public setSelectedTargets(selectedTargets: Array<HTMLElement | SVGElement>): void {
        this.selectedTargets = selectedTargets;
        this.differ = new ChildrenDiffer(selectedTargets);
    }

    public setKeyContainer(keyContainer: HTMLElement | Document | Window) {
        const options = this.options;

        diffValue(options.keyContainer, keyContainer, () => {
            options.keyContainer = keyContainer;

            this.setKeyController();
        });
    }
    public setToggleContinueSelect(toggleContinueSelect: string[] | string) {
        const options = this.options;

        diffValue(options.toggleContinueSelect, toggleContinueSelect, () => {
            options.toggleContinueSelect = toggleContinueSelect;

            this.setKeyEvent();
        });
    }

    /**
     * Destroy elements, properties, and events.
     */
    public destroy(): void {
        this.off();
        this.keycon && this.keycon.destroy();
        this.dragger.unset();
        this.injectResult.destroy();

        this.keycon = null;
        this.dragger = null;
        this.injectResult = null;
        this.target = null;
        this.container = null;
        this.options = null;
    }

    /**
     *
     */
    public click(e: MouseEvent | TouchEvent, clickedTarget?: Element): void {
        const { clientX, clientY } = getClient(e);
        const dragEvent: OnDragEvent = {
            datas: {},
            clientX,
            clientY,
            inputEvent: e,
        };
        if (this.onDragStart(dragEvent, clickedTarget)) {
            this.onDragEnd(dragEvent);
        }
    }
    private setKeyController() {
        const { keyContainer, toggleContinueSelect } = this.options;

        if (this.keycon) {
            this.keycon.destroy();
            this.keycon = null;
        }
        if (toggleContinueSelect) {
            this.keycon = new KeyController(keyContainer || window);
        }
        this.setKeyEvent();
    }
    private setKeyEvent() {
        const { toggleContinueSelect } = this.options;
        if (!this.keycon) {
            this.setKeyController();
            return;
        } else {
            this.keycon.off();
        }

        if (toggleContinueSelect) {
            this.keycon
                .keydown(toggleContinueSelect, this.onKeyDown)
                .keyup(toggleContinueSelect, this.onKeyUp);
        }
    }
    private initElement() {
        this.target = createElement(
            <div className={CLASS_NAME}></div> as any,
            this.target,
            this.container,
        );

        const target = this.target;

        this.dragger = new Dragger(this.options.dragContainer || this.target.parentElement, {
            container: window,
            dragstart: this.onDragStart,
            drag: this.onDrag,
            dragend: this.onDragEnd,
        });

        this.injectResult = injector.inject(target);
    }
    private hitTest(
        selectRect: Rect,
        clientX: number,
        clientY: number,
        targets: Array<HTMLElement | SVGElement>,
        rects: Rect[],
    ) {
        const { hitRate, selectByClick } = this.options;
        const { left, top, right, bottom } = selectRect;
        const passedTargets: Array<HTMLElement | SVGElement> = [];

        rects.forEach((rect, i) => {
            const {
                left: rectLeft,
                top: rectTop,
                right: rectRight,
                bottom: rectBottom,
            } = rect;
            const isStart
                = rectLeft <= clientX
                && clientX <= rectRight
                && rectTop <= clientY
                && clientY <= rectBottom;
            const rectSize = (rectRight - rectLeft) * (rectBottom - rectTop);
            const testLeft = Math.max(rectLeft, left);
            const testRight = Math.min(rectRight, right);
            const testTop = Math.max(rectTop, top);
            const testBottom = Math.min(rectBottom, bottom);

            if (selectByClick && isStart) {
                passedTargets.push(targets[i]);
                return;
            }
            if (testRight < testLeft || testBottom < testTop) {
                return;
            }
            const rate = Math.round((testRight - testLeft) * (testBottom - testTop) / rectSize * 100);

            if (rate >= hitRate) {
                passedTargets.push(targets[i]);
            }
        });

        return passedTargets;
    }
    private getSelectableTargets() {
        const selectableTargets: Array<HTMLElement | SVGElement> = [];

        this.options.selectableTargets.forEach(target => {
            if (isObject(target)) {
                selectableTargets.push(target);
            } else {
                const elements = [].slice.call(document.querySelectorAll(target));

                elements.forEach(el => {
                    selectableTargets.push(el);
                });
            }
        });

        return selectableTargets;
    }
    private getSelectedTargets(passedTargets: Array<HTMLElement | SVGElement>) {
        const {
            list,
            prevList,
            added,
            removed,
        } = diff(this.selectedTargets, passedTargets) as ChildrenDiffResult<HTMLElement | SVGElement>;

        return added.map(index => list[index]).concat(removed.map(index => prevList[index]));
    }
    private select(selectedTargets: Array<HTMLElement | SVGElement>, inputEvent: any, isStart?: boolean) {
        const {
            added,
            removed,
            prevList,
            list,
        } = this.differ.update(selectedTargets);

        if (isStart) {
            /**
             * When the select(drag) starts, the selectStart event is called.
             * @memberof Selecto
             * @event selectStart
             * @param {Selecto.OnSelect} - Parameters for the selectStart event
             * @example
             * import Selecto from "selecto";
             *
             * const selecto = new Selecto({
             *   container: document.body,
             *   selectByClick: true,
             *   selectFromInside: false,
             * });
             *
             * selecto.on("selectStart", e => {
             *   e.added.forEach(el => {
             *     el.classList.add("selected");
             *   });
             *   e.removed.forEach(el => {
             *     el.classList.remove("selected");
             *   });
             * }).on("selectEnd", e => {
             *   e.afterAdded.forEach(el => {
             *     el.classList.add("selected");
             *   });
             *   e.afterRemoved.forEach(el => {
             *     el.classList.remove("selected");
             *   });
             * });
             */
            this.trigger("selectStart", {
                selected: selectedTargets,
                added: added.map(index => list[index]),
                removed: removed.map(index => prevList[index]),
                inputEvent,
            });
        }
        if (added.length || removed.length) {
            /**
             * When the select in real time, the select event is called.
             * @memberof Selecto
             * @event select
             * @param {Selecto.OnSelect} - Parameters for the select event
             * @example
             * import Selecto from "selecto";
             *
             * const selecto = new Selecto({
             *   container: document.body,
             *   selectByClick: true,
             *   selectFromInside: false,
             * });
             *
             * selecto.on("select", e => {
             *   e.added.forEach(el => {
             *     el.classList.add("selected");
             *   });
             *   e.removed.forEach(el => {
             *     el.classList.remove("selected");
             *   });
             * });
             */
            this.trigger("select", {
                selected: selectedTargets,
                added: added.map(index => list[index]),
                removed: removed.map(index => prevList[index]),
                inputEvent,
            });
        }
    }
    private selecteEnd(
        startSelectedTargets: Array<HTMLElement | SVGElement>,
        selectedTargets: Array<HTMLElement | SVGElement>,
        inputEvent: any,
    ) {
        const {
            added,
            removed,
            prevList,
            list,
        } = diff(startSelectedTargets, selectedTargets);
        const {
            added: afterAdded,
            removed: afterRemoved,
            prevList: afterPrevList,
            list: afterList,
        } = diff(this.selectedTargets, selectedTargets);
        const type = inputEvent.type;
        const isDragStart = type === "mousedown" || type === "touchstart";

        /**
         * When the select(dragEnd or click) ends, the selectEnd event is called.
         * @memberof Selecto
         * @event selectEnd
         * @param {Selecto.OnSelectEnd} - Parameters for the selectEnd event
         * @example
         * import Selecto from "selecto";
         *
         * const selecto = new Selecto({
         *   container: document.body,
         *   selectByClick: true,
         *   selectFromInside: false,
         * });
         *
         * selecto.on("selectStart", e => {
         *   e.added.forEach(el => {
         *     el.classList.add("selected");
         *   });
         *   e.removed.forEach(el => {
         *     el.classList.remove("selected");
         *   });
         * }).on("selectEnd", e => {
         *   e.afterAdded.forEach(el => {
         *     el.classList.add("selected");
         *   });
         *   e.afterRemoved.forEach(el => {
         *     el.classList.remove("selected");
         *   });
         * });
         */
        this.trigger("selectEnd", {
            selected: selectedTargets,
            added: added.map(index => list[index]),
            removed: removed.map(index => prevList[index]),
            afterAdded: afterAdded.map(index => afterList[index]),
            afterRemoved: afterRemoved.map(index => afterPrevList[index]),
            isDragStart,
            inputEvent,
        });
    }
    private onDragStart = (e: OnDragEvent, clickedTarget?: Element) => {
        const { datas, clientX, clientY, inputEvent } = e;
        const { continueSelect, selectFromInside } = this.options;
        const selectableTargets = this.getSelectableTargets();
        const selectableRects = selectableTargets.map(target => {
            const rect = target.getBoundingClientRect();
            const { left, top, width, height } = rect;

            return {
                left,
                top,
                right: left + width,
                bottom: top + height,
            };
        });
        datas.selectableTargets = selectableTargets;
        datas.selectableRects = selectableRects;
        datas.startSelectedTargets = this.selectedTargets;

        const pointTarget = clickedTarget || document.elementFromPoint(clientX, clientY);
        let firstPassedTargets = this.hitTest({
            left: clientX,
            top: clientY,
            right: clientX,
            bottom: clientY,
        }, clientX, clientY, selectableTargets, selectableRects).filter(
            target => target === pointTarget || target.contains(pointTarget),
        );

        const hasInsideTargets = firstPassedTargets.length > 0;
        if (!continueSelect) {
            this.selectedTargets = [];
        } else {
            firstPassedTargets = this.getSelectedTargets(firstPassedTargets);
        }

        const type = inputEvent.type;
        const isTrusted = type === "mousedown" || type === "touchstart";
        /**
         * When the drag starts, the dragStart event is called.
         * Call the stop () function if you have a specific element or don't want to raise a select
         * @memberof Selecto
         * @event dragStart
         * @param {OnDragStart} - Parameters for the dragStart event
         * @example
         * import Selecto from "selecto";
         *
         * const selecto = new Selecto({
         *   container: document.body,
         *   selectByClick: true,
         *   selectFromInside: false,
         * });
         *
         * selecto.on("dragStart", e => {
         *   if (e.inputEvent.target.tagName === "SPAN") {
         *     e.stop();
         *   }
         * }).on("select", e => {
         *   e.added.forEach(el => {
         *     el.classList.add("selected");
         *   });
         *   e.removed.forEach(el => {
         *     el.classList.remove("selected");
         *   });
         * });
         */
        const result = isTrusted ? this.trigger("dragStart", e) : true;

        if (!result) {
            return false;
        }
        this.select(firstPassedTargets, inputEvent, true);
        datas.startX = clientX;
        datas.startY = clientY;
        datas.selectedTargets = firstPassedTargets;
        this.target.style.cssText += `left:${clientX}px;top:${clientY}px`;

        if (!selectFromInside && hasInsideTargets) {
            this.onDragEnd(e);
            return false;
        } else {
            return true;
        }
    }
    private onDrag = ({
        distX,
        distY,
        datas,
        inputEvent,
    }: OnDrag) => {
        const { startX, startY } = datas;
        const tx = Math.min(0, distX);
        const ty = Math.min(0, distY);
        const width = Math.abs(distX);
        const height = Math.abs(distY);

        this.target.style.cssText
            += `display: block;`
            + `transform: translate(${tx}px, ${ty}px);`
            + `width:${width}px;height:${height}px;`;

        const left = startX + tx;
        const top = startY + ty;
        const passedTargets = this.hitTest({
            left,
            top,
            right: left + width,
            bottom: top + height,
        }, datas.startX, datas.startY, datas.selectableTargets, datas.selectableRects);
        const selectedTargets = this.getSelectedTargets(passedTargets);

        this.select(selectedTargets, inputEvent);
        datas.selectedTargets = selectedTargets;
    }
    private onDragEnd = ({ datas, inputEvent }: OnDragEvent) => {
        this.target.style.cssText += "display: none;";
        this.selecteEnd(datas.startSelectedTargets, datas.selectedTargets, inputEvent);
        this.selectedTargets = datas.selectedTargets;
    }
    private onKeyDown = () => {
        this.continueSelect = true;
        /**
         * When you keydown the key you specified in toggleContinueSelect, the keydown event is called.
         * @memberof Selecto
         * @event keydown
         * @example
         * import Selecto from "selecto";
         *
         * const selecto = new Selecto({
         *   container: document.body,
         *   toggleContinueSelect: "shift";
         *   keyContainer: window,
         * });
         *
         * selecto.on("keydown", () => {
         *   document.querySelector(".button").classList.add("selected");
         * }).on("keyup", () => {
         *   document.querySelector(".button").classList.remove("selected");
         * }).on("select", e => {
         *   e.added.forEach(el => {
         *     el.classList.add("selected");
         *   });
         *   e.removed.forEach(el => {
         *     el.classList.remove("selected");
         *   });
         * });
         */
        this.trigger("keydown", {});
    }
    private onKeyUp = () => {
        this.continueSelect = false;
        /**
         * When you keyup the key you specified in toggleContinueSelect, the keyup event is called.
         * @memberof Selecto
         * @event keyup
         * @example
         * import Selecto from "selecto";
         *
         * const selecto = new Selecto({
         *   container: document.body,
         *   toggleContinueSelect: "shift";
         *   keyContainer: window,
         * });
         *
         * selecto.on("keydown", () => {
         *   document.querySelector(".button").classList.add("selected");
         * }).on("keyup", () => {
         *   document.querySelector(".button").classList.remove("selected");
         * }).on("select", e => {
         *   e.added.forEach(el => {
         *     el.classList.add("selected");
         *   });
         *   e.removed.forEach(el => {
         *     el.classList.remove("selected");
         *   });
         * });
         */
        this.trigger("keyup", {});
    }

}

interface Selecto extends Component, SelectoProperties {
    on<T extends keyof SelectoEvents>(eventName: T, handlerToAttach: (event: SelectoEvents[T]) => any): this;
    on(eventName: string, handlerToAttach: (event: { [key: string]: any }) => any): this;
    on(events: { [key: string]: (event: { [key: string]: any }) => any }): this;
}

export default Selecto;
