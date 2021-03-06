/* eslint max-lines: "off" */
/* eslint max-statements: "off" */
import { mount } from "enzyme";
import _ from "lodash";
import React from "react";
import { Provider } from "react-redux";
import MultiGrid from "react-virtualized/dist/commonjs/MultiGrid";

import { expect, it } from "@jest/globals";

import mockPopsicle from "../MockPopsicle";
import reduxUtils from "../redux-test-utils";

import { buildInnerHTML, clickMainMenuButton, findMainMenuButton, tickUpdate, withGlobalJquery } from "../test-utils";

import { clickColMenuButton, clickColMenuSubButton, openColMenu, validateHeaders } from "./iframe-utils";

const originalOffsetHeight = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetHeight");
const originalOffsetWidth = Object.getOwnPropertyDescriptor(HTMLElement.prototype, "offsetWidth");

const COL_PROPS = _.map(reduxUtils.DATA.columns, (c, i) => _.assignIn({ width: i == 0 ? 70 : 20, locked: i == 0 }, c));

class MockDateInput extends React.Component {
  render() {
    return null;
  }
}
MockDateInput.displayName = "DateInput";

describe("DataViewer iframe tests", () => {
  const { location, open, top, self } = window;
  let result, DataViewer, ColumnMenu, Header, Formatting, DataViewerMenu, DataViewerInfo;

  beforeAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", {
      configurable: true,
      value: 500,
    });
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", {
      configurable: true,
      value: 500,
    });

    delete window.location;
    delete window.open;
    delete window.top;
    delete window.self;
    window.location = { reload: jest.fn() };
    window.open = jest.fn();
    window.top = { location: { href: "http://test.com" } };
    window.self = { location: { href: "http://test/dtale/iframe" } };

    const mockBuildLibs = withGlobalJquery(() =>
      mockPopsicle.mock(url => {
        const { urlFetcher } = require("../redux-test-utils").default;
        return urlFetcher(url);
      })
    );

    const mockChartUtils = withGlobalJquery(() => (ctx, cfg) => {
      const chartCfg = { ctx, cfg, data: cfg.data, destroyed: false };
      chartCfg.destroy = () => (chartCfg.destroyed = true);
      chartCfg.getElementsAtXAxis = _evt => [{ _index: 0 }];
      return chartCfg;
    });

    jest.mock("popsicle", () => mockBuildLibs);
    jest.mock("chart.js", () => mockChartUtils);
    jest.mock("chartjs-plugin-zoom", () => ({}));
    jest.mock("chartjs-chart-box-and-violin-plot/build/Chart.BoxPlot.js", () => ({}));
    jest.mock("@blueprintjs/datetime", () => ({ DateInput: MockDateInput }));
    DataViewer = require("../../dtale/DataViewer").DataViewer;
    ColumnMenu = require("../../dtale/column/ColumnMenu").ReactColumnMenu;
    Header = require("../../dtale/Header").ReactHeader;
    Formatting = require("../../popups/formats/Formatting").default;
    DataViewerMenu = require("../../dtale/menu/DataViewerMenu").DataViewerMenu;
    DataViewerInfo = require("../../dtale/DataViewerInfo").ReactDataViewerInfo;
  });

  beforeEach(async () => {
    const store = reduxUtils.createDtaleStore();
    buildInnerHTML({ settings: "", iframe: "True" }, store);
    result = mount(
      <Provider store={store}>
        <DataViewer />
      </Provider>,
      {
        attachTo: document.getElementById("content"),
      }
    );
    await tickUpdate(result);
  });

  afterAll(() => {
    Object.defineProperty(HTMLElement.prototype, "offsetHeight", originalOffsetHeight);
    Object.defineProperty(HTMLElement.prototype, "offsetWidth", originalOffsetWidth);
    window.location = location;
    window.open = open;
    window.top = top;
    window.self = self;
  });

  const colMenu = () => result.find(ColumnMenu).first();

  it("DataViewer: validate menu options", async () => {
    const grid = result.find(MultiGrid).first().instance();
    validateHeaders(result, ["col1", "col2", "col3", "col4"]);
    expect(grid.props.columns).toEqual(COL_PROPS);
    result.find("div.crossed").first().find("div.grid-menu").first().simulate("click");
    expect(
      result
        .find(DataViewerMenu)
        .find("ul li span.font-weight-bold")
        .map(s => s.text())
    ).toEqual(
      _.concat(
        ["Describe", "Custom Filter", "Build Column", "Summarize Data", "Correlations", "Charts", "Heat Map"],
        ["Highlight Dtypes", "Highlight Missing", "Highlight Outliers", "Highlight Range", "Instances 1"],
        ["Code Export", "Export", "Refresh Widths", "About", "Reload Data", "Open In New Tab", "Shutdown"]
      )
    );
  });

  it("DataViewer: validate column menu options", async () => {
    await openColMenu(result, 3);
    expect(result.find("#column-menu-div").length).toBe(1);
    result.find(Header).last().instance().props.hideColumnMenu("col4");
    result.update();
    expect(result.find("#column-menu-div").length).toBe(0);
    await openColMenu(result, 3);
    expect(colMenu().find("header").first().text()).toBe('Column "col4"');
    expect(
      colMenu()
        .find("ul li span.font-weight-bold")
        .map(s => s.text())
    ).toEqual(["Lock", "Hide", "Delete", "Rename", "Replacements", "Describe", "Column Analysis", "Formats"]);
  });

  it("DataViewer: base operations (column selection, locking, sorting, moving to front, col-analysis,...", async () => {
    await openColMenu(result, 3);
    clickColMenuSubButton(result, "Asc");
    expect(result.find("div.row div.col").first().text()).toBe("Sort:col4 (ASC)");
    await tickUpdate(result);
    await openColMenu(result, 2);
    expect(colMenu().find("header").first().text()).toBe('Column "col3"');
    result.find(Header).at(2).instance().props.hideColumnMenu("col3");
    await openColMenu(result, 3);
    clickColMenuSubButton(result, "fa-step-backward", 1);
    validateHeaders(result, ["▲col4", "col1", "col2", "col3"]);
    await openColMenu(result, 3);
    clickColMenuSubButton(result, "fa-caret-left", 1);
    validateHeaders(result, ["▲col4", "col1", "col3", "col2"]);
    await openColMenu(result, 2);
    clickColMenuSubButton(result, "fa-caret-right", 1);
    validateHeaders(result, ["▲col4", "col1", "col2", "col3"]);
    await openColMenu(result, 0);
    // lock
    clickColMenuButton(result, "Lock");
    expect(
      result
        .find("div.TopRightGrid_ScrollWrapper")
        .first()
        .find("div.headerCell")
        .map(hc => hc.text())
    ).toEqual(["col1", "col2", "col3"]);
    //unlock
    await openColMenu(result, 0);
    clickColMenuButton(result, "Unlock");
    result.update();
    expect(
      result
        .find("div.TopRightGrid_ScrollWrapper")
        .first()
        .find("div.headerCell")
        .map(hc => hc.text())
    ).toEqual(["▲col4", "col1", "col2", "col3"]);
    //clear sorts
    result.find(DataViewerInfo).find("i.ico-cancel").first().simulate("click");
    await tickUpdate(result);
    expect(result.find(DataViewerInfo).find("div.row").length).toBe(0);
    await openColMenu(result, 0);
    await openColMenu(result, 3);
    await openColMenu(result, 2);
  });

  it("DataViewer: validate menu functions", async () => {
    await openColMenu(result, 2);
    clickColMenuButton(result, "Column Analysis");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe(
      "/dtale/popup/column-analysis/1?selectedCol=col3"
    );
    clickColMenuButton(result, "Describe");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe(
      "/dtale/popup/describe/1?selectedCol=col3"
    );
    clickMainMenuButton(result, "Describe");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe("/dtale/popup/describe/1");
    clickMainMenuButton(result, "Correlations");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe("/dtale/popup/correlations/1");
    clickMainMenuButton(result, "Charts");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe("/charts/1");
    clickMainMenuButton(result, "Instances 1");
    expect(window.open.mock.calls[window.open.mock.calls.length - 1][0]).toBe("/dtale/popup/instances/1");
    const exports = findMainMenuButton(result, "CSV", "div.btn-group");
    exports.find("button").first().simulate("click");
    let exportURL = window.open.mock.calls[window.open.mock.calls.length - 1][0];
    expect(_.startsWith(exportURL, "/dtale/data-export/1") && _.includes(exportURL, "tsv=false")).toBe(true);
    exports.find("button").last().simulate("click");
    exportURL = window.open.mock.calls[window.open.mock.calls.length - 1][0];
    expect(_.startsWith(exportURL, "/dtale/data-export/1") && _.includes(exportURL, "tsv=true")).toBe(true);
    clickMainMenuButton(result, "Refresh Widths");
    clickMainMenuButton(result, "Reload Data");
    expect(window.location.reload).toHaveBeenCalled();
    clickMainMenuButton(result, "Shutdown", "a");
    clickColMenuButton(result, "Formats");
    expect(result.find(Formatting).length).toBe(1);
  });
});
