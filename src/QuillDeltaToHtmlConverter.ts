
import { InsertOpsConverter } from './InsertOpsConverter';
import { OpToHtmlConverter, IOpToHtmlConverterOptions } from './OpToHtmlConverter';
import { DeltaInsertOp } from './DeltaInsertOp';
import { Grouper } from './grouper/Grouper';
import {
   VideoItem, InlineGroup, BlockGroup, ListGroup, ListItem, TDataGroup
} from './grouper/group-types';
import { ListNester } from './grouper/ListNester';
import { makeStartTag, makeEndTag, encodeHtml, ITagKeyValue } from './funcs-html';
import './extensions/Object';
import { GroupType } from './value-types';


interface IQuillDeltaToHtmlConverterOptions {
   // no more allowing these to be customized; unnecessary
   orderedListTag?: string,
   bulletListTag?: string,
   listItemTag?: string,

   paragraphTag?: string,
   classPrefix?: string,
   encodeHtml?: boolean,
   multiLineBlockquote?: boolean,
   multiLineHeader?: boolean,
   multiLineCodeblock?: boolean,

   linkRel?: string,
   linkTarget?: string,
   allowBackgroundClasses?: boolean
}

const BrTag = '<br/>';

class QuillDeltaToHtmlConverter {

   private options: IQuillDeltaToHtmlConverterOptions;
   private rawDeltaOps: any[] = [];
   private converterOptions: IOpToHtmlConverterOptions;

   // render callbacks
   private callbacks: any = {};

   constructor(
      deltaOps: any[],
      options?: IQuillDeltaToHtmlConverterOptions) {

      this.options = Object._assign({
         paragraphTag: 'p',
         encodeHtml: true,
         classPrefix: 'ql',
         multiLineBlockquote: true,
         multiLineHeader: true,
         multiLineCodeblock: true,
         allowBackgroundClasses: false,
         linkTarget: '_blank'
      }, options, {
            orderedListTag: 'ol',
            bulletListTag: 'ul',
            listItemTag: 'li'
         });

      this.converterOptions = {
         encodeHtml: this.options.encodeHtml,
         classPrefix: this.options.classPrefix,
         listItemTag: this.options.listItemTag,
         paragraphTag: this.options.paragraphTag,
         linkRel: this.options.linkRel,
         linkTarget: this.options.linkTarget,
         allowBackgroundClasses: this.options.allowBackgroundClasses
      };
      this.rawDeltaOps = deltaOps;

   }

   _getListTag(op: DeltaInsertOp): string {
      return op.isOrderedList() ? this.options.orderedListTag + ''
         : op.isBulletList() ? this.options.bulletListTag + ''
            : op.isCheckedList() ? this.options.bulletListTag + ''
               : op.isUncheckedList() ? this.options.bulletListTag + ''
                  : '';
   }

   _getListAttr(op: DeltaInsertOp): ITagKeyValue | ITagKeyValue[] | undefined {
      return op.isCheckedList() ? { key: 'data-checked', value: 'true' }
         : op.isUncheckedList() ? { key: 'data-checked', value: 'false' }
            : undefined;
   }

   getGroupedOps(): TDataGroup[] {
      var deltaOps = InsertOpsConverter.convert(this.rawDeltaOps);

      var pairedOps = Grouper.pairOpsWithTheirBlock(deltaOps);

      var groupedSameStyleBlocks = Grouper.groupConsecutiveSameStyleBlocks(pairedOps, {
         blockquotes: !!this.options.multiLineBlockquote,
         header: !!this.options.multiLineHeader,
         codeBlocks: !!this.options.multiLineCodeblock
      });

      var groupedOps = Grouper.reduceConsecutiveSameStyleBlocksToOne(groupedSameStyleBlocks);
      var listNester = new ListNester();
      return listNester.nest(groupedOps);
   }

   convert() {
      return this.getGroupedOps()
         .map(group => {
            if (group instanceof ListGroup) {

               return this._renderWithCallbacks(
                  GroupType.List, group, () => this._renderList(<ListGroup>group));

            } else if (group instanceof BlockGroup) {

               var g = <BlockGroup>group;

               return this._renderWithCallbacks(
                  GroupType.Block, group, () => this._renderBlock(g.op, g.ops));

            } else if (group instanceof VideoItem) {

               return this._renderWithCallbacks(GroupType.Video, group, () => {
                  var g = <VideoItem>group;
                  var converter = new OpToHtmlConverter(g.op, this.converterOptions);
                  return converter.getHtml();
               });

            } else { // InlineGroup
               return this._renderWithCallbacks(GroupType.InlineGroup, group, () => {
                  return this._renderInlines((<InlineGroup>group).ops);
               });
            }
         })
         .join("");
   }

   _renderWithCallbacks(groupType: GroupType, group: TDataGroup, myRenderFn: () => string) {
      var html = '';
      var beforeCb = this.callbacks['beforeRender_cb'];
      html = typeof beforeCb === 'function' ? beforeCb.apply(null, [groupType, group]) : '';

      if (!html) {
         html = myRenderFn();
      }

      var afterCb = this.callbacks['afterRender_cb'];
      html = typeof afterCb === 'function' ? afterCb.apply(null, [groupType, html]) : html;

      return html;
   }

   _renderList(list: ListGroup): string {

      var firstItem = list.items[0];
      return makeStartTag(this._getListTag(firstItem.item.op), this._getListAttr(firstItem.item.op))
         + list.items.map((li: ListItem) => this._renderListItem(li)).join('')
         + makeEndTag(this._getListTag(firstItem.item.op));
   }

   _renderListItem(li: ListItem): string {

      //if (!isOuterMost) {
      li.item.op.attributes.indent = 0;
      //}
      var converter = new OpToHtmlConverter(li.item.op, this.converterOptions);
      var parts = converter.getHtmlParts();
      var liElementsHtml = this._renderInlines(li.item.ops, false);
      return parts.openingTag + (liElementsHtml) +
         (li.innerList ? this._renderList(li.innerList) : '')
         + parts.closingTag;
   }

   _renderBlock(bop: DeltaInsertOp, ops: DeltaInsertOp[]) {
      var converter = new OpToHtmlConverter(bop, this.converterOptions);
      var htmlParts = converter.getHtmlParts();

      if (bop.isCodeBlock()) {
         return htmlParts.openingTag +
            encodeHtml(
               ops.map((iop) =>
                  iop.isCustom() ? this._renderCustom(iop, bop) : iop.insert.value
               ).join("")
            )
            + htmlParts.closingTag;
      }

      var inlines = ops.map(op => this._renderInline(op, bop)).join('');
      return htmlParts.openingTag + (inlines || BrTag) + htmlParts.closingTag;
   }

   _renderInlines(ops: DeltaInsertOp[], wrapInParagraphTag = true) {
      var opsLen = ops.length - 1;
      var html = ops.map((op: DeltaInsertOp, i: number) => {
         if (i > 0 && i === opsLen && op.isJustNewline()) {
            return '';
         }
         return this._renderInline(op, null);
      }).join('');
      if (!wrapInParagraphTag) {
         return html;
      }
      return makeStartTag(this.options.paragraphTag) +
         html + makeEndTag(this.options.paragraphTag);
   }

   _renderInline(op: DeltaInsertOp, contextOp: DeltaInsertOp | null) {
      if (op.isCustom()) {
         return this._renderCustom(op, contextOp);
      }
      var converter = new OpToHtmlConverter(op, this.converterOptions);
      return converter.getHtml().replace(/\n/g, BrTag);
   }

   _renderCustom(op: DeltaInsertOp, contextOp: DeltaInsertOp | null) {
      var renderCb = this.callbacks['renderCustomOp_cb'];
      if (typeof renderCb === 'function') {
         return renderCb.apply(null, [op, contextOp]);
      }
      return "";
   }

   beforeRender(cb: (group: GroupType, data: TDataGroup) => string) {
      if (typeof cb === 'function') {
         this.callbacks['beforeRender_cb'] = cb;
      }
   }

   afterRender(cb: (group: GroupType, html: string) => string) {
      if (typeof cb === 'function') {
         this.callbacks['afterRender_cb'] = cb;
      }
   }

   renderCustomWith(cb: (op: DeltaInsertOp, contextOp: DeltaInsertOp) => string) {
      this.callbacks['renderCustomOp_cb'] = cb;
   }

}

export { QuillDeltaToHtmlConverter };
