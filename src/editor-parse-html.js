// This file is part of Vidyamantra - http:www.vidyamantra.com/
/**
 * By this file we are creating the Editor
 * It depends on parameters what kind of editor(Rich Text or Code editor would be created)
 *
 * @Copyright 2015  Vidyamantra Edusystems. Pvt.Ltd.
 * @author  Suman Bogati <http://www.vidyamantra.com>
 *
 *
 */
(function (window) {
  const ParseHtml = (function () {
    const { LIST_TYPE } = window.LineFormatting;

    /**
     * Represents the current parse state as an immutable structure.  To create a new ParseState, use
     * the withXXX methods.
     *
     * @param opt_listType
     * @param opt_lineFormatting
     * @param opt_textFormatting
     * @constructor
     */
    function ParseState(opt_listType, opt_lineFormatting, opt_textFormatting) {
      this.listType = opt_listType || LIST_TYPE.UNORDERED;
      this.lineFormatting = opt_lineFormatting || vceditor.LineFormatting();
      this.textFormatting = opt_textFormatting || vceditor.Formatting();
    }

    ParseState.prototype.withTextFormatting = function (textFormatting) {
      return new ParseState(this.listType, this.lineFormatting, textFormatting);
    };

    ParseState.prototype.withLineFormatting = function (lineFormatting) {
      return new ParseState(this.listType, lineFormatting, this.textFormatting);
    };

    ParseState.prototype.withListType = function (listType) {
      return new ParseState(listType, this.lineFormatting, this.textFormatting);
    };

    ParseState.prototype.withIncreasedIndent = function () {
      const lineFormatting = this.lineFormatting.indent(this.lineFormatting.getIndent() + 1);
      return new ParseState(this.listType, lineFormatting, this.textFormatting);
    };

    ParseState.prototype.withAlign = function (align) {
      const lineFormatting = this.lineFormatting.align(align);
      return new ParseState(this.listType, lineFormatting, this.textFormatting);
    };

    /**
     * Mutable structure representing the current parse output.
     * @constructor
     */
    function ParseOutput() {
      this.lines = [];
      this.currentLine = [];
      this.currentLineListItemType = null;
    }

    ParseOutput.prototype.newlineIfNonEmpty = function (state) {
      this.cleanLine_();
      if (this.currentLine.length > 0) {
        this.newline(state);
      }
    };

    ParseOutput.prototype.newlineIfNonEmptyOrListItem = function (state) {
      this.cleanLine_();
      if (this.currentLine.length > 0 || this.currentLineListItemType !== null) {
        this.newline(state);
      }
    };

    ParseOutput.prototype.newline = function (state) {
      this.cleanLine_();
      let { lineFormatting } = state;
      if (this.currentLineListItemType !== null) {
        lineFormatting = lineFormatting.listItem(this.currentLineListItemType);
        this.currentLineListItemType = null;
      }

      this.lines.push(vceditor.Line(this.currentLine, lineFormatting));
      this.currentLine = [];
    };

    ParseOutput.prototype.makeListItem = function (type) {
      this.currentLineListItemType = type;
    };

    ParseOutput.prototype.cleanLine_ = function () {
      // Kinda' a hack, but we remove leading and trailing spaces (since these aren't significant in html) and
      // replaces nbsp's with normal spaces.
      if (this.currentLine.length > 0) {
        const last = this.currentLine.length - 1;
        this.currentLine[0].text = this.currentLine[0].text.replace(/^ +/, '');
        this.currentLine[last].text = this.currentLine[last].text.replace(/ +$/g, '');
        for (let i = 0; i < this.currentLine.length; i++) {
          this.currentLine[i].text = this.currentLine[i].text.replace(/\u00a0/g, ' ');
        }
      }
      // If after stripping trailing whitespace, there's nothing left, clear currentLine out.
      if (this.currentLine.length === 1 && this.currentLine[0].text === '') {
        this.currentLine = [];
      }
    };

    let entityManager_;

    function parseHtml(html, entityManager) {
      // Create DIV with HTML (as a convenient way to parse it).
      const div = (vceditor.document || document).createElement('div');
      div.innerHTML = html;

      // HACK until I refactor this.
      entityManager_ = entityManager;

      const output = new ParseOutput();
      const state = new ParseState();
      parseNode(div, state, output);

      return output.lines;
    }

    // Fix IE8.
    var Node = Node || {
      ELEMENT_NODE: 1,
      TEXT_NODE: 3,
    };

    function parseNode(node, state, output) {
      // Give entity manager first crack at it.
      if (node.nodeType === Node.ELEMENT_NODE) {
        const entity = entityManager_.fromElement(node);
        if (entity) {
          output.currentLine.push(new vceditor.Text(
            vceditor.sentinelConstants.ENTITY_SENTINEL_CHARACTER,
            new vceditor.Formatting(entity.toAttributes()),
          ));
          return;
        }
      }

      switch (node.nodeType) {
        case Node.TEXT_NODE:
          // This probably isn't exactly right, but mostly works...
          var text = node.nodeValue.replace(/[ \n\t]+/g, ' ');
          output.currentLine.push(vceditor.Text(text, state.textFormatting));
          break;
        case Node.ELEMENT_NODE:
          var style = node.getAttribute('style') || '';
          state = parseStyle(state, style);
          switch (node.nodeName.toLowerCase()) {
            case 'div':
            case 'h1':
            case 'h2':
            case 'h3':
            case 'p':
              output.newlineIfNonEmpty(state);
              parseChildren(node, state, output);
              output.newlineIfNonEmpty(state);
              break;
            case 'center':
              state = state.withAlign('center');
              output.newlineIfNonEmpty(state);
              parseChildren(node, state.withAlign('center'), output);
              output.newlineIfNonEmpty(state);
              break;
            case 'b':
            case 'strong':
              parseChildren(node, state.withTextFormatting(state.textFormatting.bold(true)), output);
              break;
            case 'u':
              parseChildren(node, state.withTextFormatting(state.textFormatting.underline(true)), output);
              break;
            case 'i':
            case 'em':
              parseChildren(node, state.withTextFormatting(state.textFormatting.italic(true)), output);
              break;
            case 's':
              parseChildren(node, state.withTextFormatting(state.textFormatting.strike(true)), output);
              break;
            case 'font':
              var face = node.getAttribute('face');
              var color = node.getAttribute('color');
              var size = parseInt(node.getAttribute('size'));
              if (face) {
                state = state.withTextFormatting(state.textFormatting.font(face));
              }
              if (color) {
                state = state.withTextFormatting(state.textFormatting.color(color));
              }
              if (size) {
                state = state.withTextFormatting(state.textFormatting.fontSize(size));
              }
              parseChildren(node, state, output);
              break;
            case 'br':
              output.newline(state);
              break;
            case 'ul':
              output.newlineIfNonEmptyOrListItem(state);
              var listType = node.getAttribute('class') === 'vceditor-todo' ? LIST_TYPE.TODO : LIST_TYPE.UNORDERED;
              parseChildren(node, state.withListType(listType).withIncreasedIndent(), output);
              output.newlineIfNonEmpty(state);
              break;
            case 'ol':
              output.newlineIfNonEmptyOrListItem(state);
              parseChildren(node, state.withListType(LIST_TYPE.ORDERED).withIncreasedIndent(), output);
              output.newlineIfNonEmpty(state);
              break;
            case 'li':
              parseListItem(node, state, output);
              break;
            case 'style': // ignore.
              break;
            default:
              parseChildren(node, state, output);
              break;
          }
          break;
        default:
          // Ignore other nodes (comments, etc.)
          break;
      }
    }

    function parseChildren(node, state, output) {
      if (node.hasChildNodes()) {
        for (let i = 0; i < node.childNodes.length; i++) {
          parseNode(node.childNodes[i], state, output);
        }
      }
    }

    function parseListItem(node, state, output) {
      // Note: <li> is weird:
      // * Only the first line in the <li> tag should be a list item (i.e. with a bullet or number next to it).
      // * <li></li> should create an empty list item line; <li><ol><li></li></ol></li> should create two.

      output.newlineIfNonEmptyOrListItem(state);

      const listType = (node.getAttribute('class') === 'vceditor-checked') ? LIST_TYPE.TODOCHECKED : state.listType;
      output.makeListItem(listType);
      const oldLine = output.currentLine;

      parseChildren(node, state, output);

      if (oldLine === output.currentLine || output.currentLine.length > 0) {
        output.newline(state);
      }
    }

    function parseStyle(state, styleString) {
      let { textFormatting } = state;
      let { lineFormatting } = state;
      const styles = styleString.split(';');
      for (let i = 0; i < styles.length; i++) {
        const stylePieces = styles[i].split(':');
        if (stylePieces.length !== 2) continue;
        const prop = vceditor.utils.trim(stylePieces[0]).toLowerCase();
        const val = vceditor.utils.trim(stylePieces[1]).toLowerCase();
        switch (prop) {
          case 'text-decoration':
            var underline = val.indexOf('underline') >= 0;
            var strike = val.indexOf('line-through') >= 0;
            textFormatting = textFormatting.underline(underline).strike(strike);
            break;
          case 'font-weight':
            var bold = (val === 'bold') || parseInt(val) >= 600;
            textFormatting = textFormatting.bold(bold);
            break;
          case 'font-style':
            var italic = (val === 'italic' || val === 'oblique');
            textFormatting = textFormatting.italic(italic);
            break;
          case 'color':
            textFormatting = textFormatting.color(val);
            break;
          case 'background-color':
            textFormatting = textFormatting.backgroundColor(val);
            break;
          case 'text-align':
            lineFormatting = lineFormatting.align(val);
            break;
          case 'font-size':
            var size = null;
            var allowedValues = ['px', 'pt', '%', 'em', 'xx-small', 'x-small', 'small', 'medium', 'large', 'x-large', 'xx-large', 'smaller', 'larger'];
            if (vceditor.utils.stringEndsWith(val, allowedValues)) {
              size = val;
            } else if (parseInt(val)) {
              size = `${parseInt(val)}px`;
            }
            if (size) {
              textFormatting = textFormatting.fontSize(size);
            }
            break;
          case 'font-family':
            var font = vceditor.utils.trim(val.split(',')[0]); // get first font.
            font = font.replace(/['"]/g, ''); // remove quotes.
            font = font.replace(/\w\S*/g, txt => txt.charAt(0).toUpperCase() + txt.substr(1).toLowerCase());
            textFormatting = textFormatting.font(font);
            break;
        }
      }
      return state.withLineFormatting(lineFormatting).withTextFormatting(textFormatting);
    }

    return parseHtml;
  }());
  window.ParseHtml = ParseHtml;
}(window));
