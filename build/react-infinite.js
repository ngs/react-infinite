'use strict';

var React = global.React || require('react');
var ReactDOM = global.ReactDOM || require('react-dom');
var _assign = require('object-assign');
var checkProps = require('./utils/checkProps');
var infiniteHelpers = require('./utils/infiniteHelpers');

var Infinite = React.createClass({
  displayName: 'Infinite',

  propTypes: {
    handleScroll: React.PropTypes.func,

    // preloadBatchSize causes updates only to
    // happen each preloadBatchSize pixels of scrolling.
    // Set a larger number to cause fewer updates to the
    // element list.
    preloadBatchSize: React.PropTypes.number,
    // preloadAdditionalHeight determines how much of the
    // list above and below the container is preloaded even
    // when it is not currently visible to the user. In the
    // regular scroll implementation, preloadAdditionalHeight
    // is equal to the entire height of the list.
    preloadAdditionalHeight: React.PropTypes.number, // page to screen ratio

    // The provided elementHeight can be either
    //  1. a constant: all elements are the same height
    //  2. an array containing the height of each element
    elementHeight: React.PropTypes.oneOfType([React.PropTypes.number, React.PropTypes.arrayOf(React.PropTypes.number)]).isRequired,
    // This is the total height of the visible window. One
    // of
    containerHeight: React.PropTypes.number,
    useWindowAsScrollContainer: React.PropTypes.bool,

    infiniteLoadBeginBottomOffset: React.PropTypes.number,
    onInfiniteLoad: React.PropTypes.func,
    loadingSpinnerDelegate: React.PropTypes.node,

    isInfiniteLoading: React.PropTypes.bool,
    timeScrollStateLastsForAfterUserScrolls: React.PropTypes.number,

    className: React.PropTypes.string
  },

  getDefaultProps: function getDefaultProps() {
    return {
      handleScroll: function handleScroll() {},
      loadingSpinnerDelegate: React.createElement('div', null),
      onInfiniteLoad: function onInfiniteLoad() {},
      isInfiniteLoading: false,
      timeScrollStateLastsForAfterUserScrolls: 150,
      useWindowAsScrollContainer: false,
      className: ''
    };
  },

  // automatic adjust to scroll direction
  // give spinner a ReactCSSTransitionGroup
  getInitialState: function getInitialState() {
    var nextInternalState = this.recomputeInternalStateFromProps(this.props);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;

    var state = nextInternalState.newState;
    state.scrollTimeout = undefined;
    state.isScrolling = false;

    return state;
  },

  generateComputedProps: function generateComputedProps(props) {
    var computedProps = _assign({}, props);
    computedProps.containerHeight = props.useWindowAsScrollContainer ? window.innerHeight : props.containerHeight;
    computedProps.preloadBatchSize = typeof props.preloadBatchSize === 'number' ? props.preloadBatchSize : computedProps.containerHeight / 2;
    computedProps.preloadAdditionalHeight = typeof props.preloadAdditionalHeight === 'number' ? props.preloadAdditionalHeight : computedProps.containerHeight;
    return computedProps;
  },

  generateComputedUtilityFunctions: function generateComputedUtilityFunctions(props) {
    var _this = this;

    var utilities = {};
    if (props.useWindowAsScrollContainer) {
      utilities.subscribeToScrollListener = function () {
        window.addEventListener('scroll', _this.infiniteHandleScroll);
      };
      utilities.unsubscribeFromScrollListener = function () {
        window.removeEventListener('scroll', _this.infiniteHandleScroll);
      };
      utilities.nodeScrollListener = function () {};
      utilities.getScrollTop = function () {
        return window.scrollY;
      };
      utilities.scrollShouldBeIgnored = function () {
        return false;
      };
      utilities.buildScrollableStyle = function () {
        return {};
      };
    } else {
      utilities.subscribeToScrollListener = function () {};
      utilities.unsubscribeFromScrollListener = function () {};
      utilities.nodeScrollListener = this.infiniteHandleScroll;
      utilities.getScrollTop = function () {
        var scrollable;
        if (_this.refs && _this.refs.scrollable) {
          scrollable = ReactDOM.findDOMNode(_this.refs.scrollable);
        }
        return scrollable ? scrollable.scrollTop : 0;
      };
      utilities.scrollShouldBeIgnored = function (event) {
        return event.target !== ReactDOM.findDOMNode(_this.refs.scrollable);
      };
      utilities.buildScrollableStyle = function () {
        return {
          height: _this.computedProps.containerHeight,
          overflowX: 'hidden',
          overflowY: 'scroll',
          WebkitOverflowScrolling: 'touch'
        };
      };
    }
    return utilities;
  },

  recomputeInternalStateFromProps: function recomputeInternalStateFromProps(props) {
    checkProps(props);
    var computedProps = this.generateComputedProps(props);
    var utils = this.generateComputedUtilityFunctions(props);

    var newState = {
      numberOfChildren: React.Children.count(computedProps.children)
    };

    newState.infiniteComputer = infiniteHelpers.createInfiniteComputer(computedProps.elementHeight, computedProps.children);

    if (computedProps.isInfiniteLoading !== undefined) {
      newState.isInfiniteLoading = computedProps.isInfiniteLoading;
    }

    newState.preloadBatchSize = computedProps.preloadBatchSize;
    newState.preloadAdditionalHeight = computedProps.preloadAdditionalHeight;

    _assign(newState, infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(newState, utils.getScrollTop()));

    return {
      computedProps: computedProps,
      utils: utils,
      newState: newState
    };
  },

  componentWillReceiveProps: function componentWillReceiveProps(nextProps) {
    var nextInternalState = this.recomputeInternalStateFromProps(nextProps);

    this.computedProps = nextInternalState.computedProps;
    this.utils = nextInternalState.utils;

    this.setState(nextInternalState.newState);
  },

  componentDidUpdate: function componentDidUpdate(prevProps, prevState) {
    if (React.Children.count(this.props.children) !== React.Children.count(prevProps.children)) {
      var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(this.state, this.utils.getScrollTop());
      this.setState(newApertureState);
    }
  },

  componentDidMount: function componentDidMount() {
    this.utils.subscribeToScrollListener();
  },

  componentWillUnmount: function componentWillUnmount() {
    this.utils.unsubscribeFromScrollListener();
  },

  infiniteHandleScroll: function infiniteHandleScroll(e) {
    if (this.utils.scrollShouldBeIgnored(e)) {
      return;
    }
    this.computedProps.handleScroll(ReactDOM.findDOMNode(this.refs.scrollable));
    this.handleScroll(this.utils.getScrollTop());
  },

  manageScrollTimeouts: function manageScrollTimeouts() {
    // Maintains a series of timeouts to set this.state.isScrolling
    // to be true when the element is scrolling.

    if (this.state.scrollTimeout) {
      clearTimeout(this.state.scrollTimeout);
    }

    var that = this,
        scrollTimeout = setTimeout(function () {
      that.setState({
        isScrolling: false,
        scrollTimeout: undefined
      });
    }, this.computedProps.timeScrollStateLastsForAfterUserScrolls);

    this.setState({
      isScrolling: true,
      scrollTimeout: scrollTimeout
    });
  },

  handleScroll: function handleScroll(scrollTop) {
    this.manageScrollTimeouts();

    var newApertureState = infiniteHelpers.recomputeApertureStateFromOptionsAndScrollTop(this.state, scrollTop);

    var infiniteScrollBottomLimit = scrollTop > this.state.infiniteComputer.getTotalScrollableHeight() - this.computedProps.containerHeight - this.computedProps.infiniteLoadBeginBottomOffset;
    if (infiniteScrollBottomLimit && !this.state.isInfiniteLoading) {
      this.setState(_assign(newApertureState, {
        isInfiniteLoading: true
      }));
      this.computedProps.onInfiniteLoad();
    } else {
      this.setState(newApertureState);
    }
  },

  buildHeightStyle: function buildHeightStyle(height) {
    return {
      width: '100%',
      height: Math.ceil(height)
    };
  },

  render: function render() {
    var displayables;
    if (React.Children.count(this.computedProps.children) > 1) {
      displayables = this.computedProps.children.slice(this.state.displayIndexStart, this.state.displayIndexEnd + 1);
    } else {
      displayables = this.computedProps.children;
    }

    var infiniteScrollStyles = {};
    if (this.state.isScrolling) {
      infiniteScrollStyles.pointerEvents = 'none';
    }

    var topSpacerHeight = this.state.infiniteComputer.getTopSpacerHeight(this.state.displayIndexStart),
        bottomSpacerHeight = this.state.infiniteComputer.getBottomSpacerHeight(this.state.displayIndexEnd);

    // topSpacer and bottomSpacer take up the amount of space that the
    // rendered elements would have taken up otherwise
    return React.createElement(
      'div',
      { className: this.computedProps.className,
        ref: 'scrollable',
        style: this.utils.buildScrollableStyle(),
        onScroll: this.utils.nodeScrollListener },
      React.createElement(
        'div',
        { ref: 'smoothScrollingWrapper', style: infiniteScrollStyles },
        React.createElement('div', { ref: 'topSpacer',
          style: this.buildHeightStyle(topSpacerHeight) }),
        displayables,
        React.createElement('div', { ref: 'bottomSpacer',
          style: this.buildHeightStyle(bottomSpacerHeight) }),
        React.createElement(
          'div',
          { ref: 'loadingSpinner' },
          this.state.isInfiniteLoading ? this.computedProps.loadingSpinnerDelegate : null
        )
      )
    );
  }
});

module.exports = Infinite;
global.Infinite = Infinite;