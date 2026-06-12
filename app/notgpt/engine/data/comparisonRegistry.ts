export type ComparisonProp = {
  pid: string;
  label: string;
};

export type ComparisonClass = {
  p31Values: string[];
  props: ComparisonProp[];
};

export const COMPARISON_REGISTRY: ComparisonClass[] = [
  {
    // Humans
    p31Values: ["Q5"],
    props: [
      { pid: "P569", label: "Birth date" },
      { pid: "P570", label: "Death date" },
      { pid: "P106", label: "Occupation" },
      { pid: "P27", label: "Citizenship" },
      { pid: "P2048", label: "Height" },
    ],
  },
  {
    // Countries
    p31Values: ["Q6256"],
    props: [
      { pid: "P1082", label: "Population" },
      { pid: "P2046", label: "Area" },
      { pid: "P36", label: "Capital" },
      { pid: "P37", label: "Official language" },
      { pid: "P571", label: "Inception" },
    ],
  },
  {
    // Cities
    p31Values: ["Q515", "Q1549591"],
    props: [
      { pid: "P1082", label: "Population" },
      { pid: "P17", label: "Country" },
      { pid: "P2044", label: "Elevation" },
    ],
  },
  {
    // Software
    p31Values: ["Q7397", "Q341"],
    props: [
      { pid: "P178", label: "Developer" },
      { pid: "P275", label: "License" },
      { pid: "P571", label: "Inception" },
      { pid: "P277", label: "Programming language" },
    ],
  },
  {
    // Films
    p31Values: ["Q11424"],
    props: [
      { pid: "P57", label: "Director" },
      { pid: "P577", label: "Release date" },
      { pid: "P2142", label: "Box office" },
      { pid: "P2047", label: "Runtime" },
    ],
  },
  {
    // Books
    p31Values: ["Q571"],
    props: [
      { pid: "P50", label: "Author" },
      { pid: "P577", label: "Publication date" },
      { pid: "P136", label: "Genre" },
    ],
  },
  {
    // Companies
    p31Values: ["Q783794", "Q4830453"],
    props: [
      { pid: "P169", label: "CEO" },
      { pid: "P571", label: "Founded" },
      { pid: "P159", label: "Headquarters" },
      { pid: "P1128", label: "Employees" },
    ],
  },
];
