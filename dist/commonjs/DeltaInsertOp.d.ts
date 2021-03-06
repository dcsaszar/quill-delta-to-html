import { IOpAttributes } from "./OpAttributeSanitizer";
import { InsertData } from './InsertData';
declare class DeltaInsertOp {
    readonly insert: InsertData;
    readonly attributes: IOpAttributes;
    constructor(insertVal: InsertData | string, attributes?: IOpAttributes);
    static createNewLineOp(): DeltaInsertOp;
    isContainerBlock(): boolean;
    isBlockquote(): boolean;
    isHeader(): boolean;
    isSameHeaderAs(op: DeltaInsertOp): boolean;
    hasSameAdiAs(op: DeltaInsertOp): boolean;
    hasSameIndentationAs(op: DeltaInsertOp): boolean;
    hasHigherIndentThan(op: DeltaInsertOp): boolean;
    isInline(): boolean;
    isCodeBlock(): boolean;
    isJustNewline(): boolean;
    isList(): boolean;
    isOrderedList(): boolean;
    isBulletList(): boolean;
    isCheckedList(): boolean;
    isUncheckedList(): boolean;
    isACheckList(): boolean;
    isSameListAs(op: DeltaInsertOp): boolean;
    isText(): boolean;
    isImage(): boolean;
    isFormula(): boolean;
    isVideo(): boolean;
    isLink(): boolean;
    isCustom(): boolean;
    isMentions(): boolean;
}
export { DeltaInsertOp };
