// @vitest-environment jsdom
import { fireEvent, render, screen } from "@testing-library/react";
import userEvent from "@testing-library/user-event";
import { describe, expect, it, vi } from "vitest";
import type { CustomField } from "@/lib/custom-fields";
import { FieldInputs } from "./FieldInputs";
import { KeyStepper } from "./KeyStepper";

describe("KeyStepper", () => {
  it("±1 ずつ変え、範囲の端で止める", async () => {
    const onChange = vi.fn();
    const { rerender } = render(<KeyStepper value={0} onChange={onChange} />);
    expect(screen.getByRole("group", { name: "キー" })).toHaveTextContent("±0");
    await userEvent.click(screen.getByRole("button", { name: "キーを上げる" }));
    await userEvent.click(screen.getByRole("button", { name: "キーを下げる" }));
    expect(onChange.mock.calls).toEqual([[1], [-1]]);

    rerender(<KeyStepper value={7} onChange={onChange} />);
    await userEvent.click(screen.getByRole("button", { name: "キーを上げる" }));
    expect(onChange).toHaveBeenLastCalledWith(7);
  });
});

const field = (id: string, type: CustomField["type"], options: string[] = []): CustomField => ({
  id,
  name: `項目${id}`,
  type,
  options,
  sortOrder: 0,
  showInList: false,
  hidden: false,
});

describe("FieldInputs", () => {
  it("項目がなければ何も描かない", () => {
    const { container } = render(<FieldInputs fields={[]} values={{}} onChange={() => {}} />);
    expect(container).toBeEmptyDOMElement();
  });

  it("種類ごとの入力欄を出し、変更を項目IDとともに通知する", async () => {
    const onChange = vi.fn();
    render(
      <FieldInputs
        fields={[
          field("t", "text"),
          field("n", "number"),
          field("d", "date"),
          field("s", "select", ["高", "低"]),
          field("m", "multi_select", ["DAM", "JOY"]),
          field("c", "checkbox"),
        ]}
        values={{ n: 3, m: ["DAM"], c: true }}
        onChange={onChange}
      />,
    );

    expect(screen.getByLabelText("項目n")).toHaveValue(3);
    expect(screen.getByLabelText("項目d")).toHaveAttribute("type", "date");
    expect(screen.getByLabelText("項目t")).toHaveAttribute("maxLength", "200");

    fireEvent.change(screen.getByLabelText("項目t"), { target: { value: "メモ" } });
    expect(onChange).toHaveBeenLastCalledWith("t", "メモ");

    await userEvent.selectOptions(screen.getByLabelText("項目s"), "低");
    expect(onChange).toHaveBeenLastCalledWith("s", "低");

    const group = screen.getByRole("group", { name: "項目m" });
    expect(screen.getByRole("button", { name: "DAM" })).toHaveAttribute("aria-pressed", "true");
    await userEvent.click(screen.getByRole("button", { name: "JOY" }));
    expect(onChange).toHaveBeenLastCalledWith("m", ["DAM", "JOY"]);
    await userEvent.click(screen.getByRole("button", { name: "DAM" }));
    expect(onChange).toHaveBeenLastCalledWith("m", []);
    expect(group).toBeInTheDocument();

    await userEvent.click(screen.getByLabelText("項目c"));
    expect(onChange).toHaveBeenLastCalledWith("c", false);
  });
});
