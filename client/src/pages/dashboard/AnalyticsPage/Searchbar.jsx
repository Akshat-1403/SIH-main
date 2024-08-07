import { useState, useMemo } from "react";
import SearchImg from "./../../../assets/Search.png";
import axios from "axios";

const BASE_URL = process.env.REACT_APP_URL;

const SearchBar = ({ setCourse }) => {
  const [Array, setArray] = useState([]);
  const [state, setState] = useState({
    search: "",
    level: "",
  });

  const [focus, setFocus] = useState(false);

  const debounce = () => {
    let timeOutId;
    return (e) => {
      let stateTemp;
      setState((prev) => {
        stateTemp = {
          ...prev,
          [e.target.name]: e.target.value,
        };
        return stateTemp;
      });
      clearTimeout(timeOutId);
      timeOutId = setTimeout(() => {
        searchFunc(stateTemp);
      }, 900);
    };
  };

  const searchFunc = async ({ search, level }) => {
    if (!search) search = "";
    if (!level || level === "Select level") level = "";

    let query = "?";
    query += `search=${search}`;
    query += `&level=${level}`;

    let response = undefined;
    const url = `${BASE_URL}/api/v1/courses${query}`;

    try {
      response = await axios.get(url, { withCredentials: true });
      if (response.request.status >= 400) {
        throw new Error("Cannot get course!");
      }
      setArray(response.data?.data);
    } catch (err) {
      // error handling
    }
    return response;
  };

  const handleSearch = useMemo(
    () => debounce(),
    // eslint-disable-next-line
    []
  );

  return (
    <div>
      {/* Search Bar Section */}
      <div className="w-full flex justify-between items-center my-2 rounded-xl relative">
        <div className="border-2 border-gray-400 bg-white h-fit flex rounded my-2 items-center">
          <img src={SearchImg} alt="search" className="w-8 h-8" />
          <input
            type="text"
            name="search"
            value={state.search}
            onChange={handleSearch}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false))}
            placeholder=" Enter course name or id..."
            className="rounded focus:outline-none w-[40vw] h-8"
          />
        </div>
        {focus && Array.length > 0 && (
          <div className="mx-2 absolute w-[42vw] min-h-12 max-h-80 overflow-y-auto top-[100%] p-1 border-2 border-gray-400 bg-white divide-y rounded">
            {Array.map((el, indx) => {
              return (
                <div
                  key={indx}
                  className="px-2 py-1 border-gray-400 first:border-t-0 flex justify-between hover:cursor-pointer"
                  onClick={() => {
                    setCourse(el);
                  }}
                >
                  <p>{el.title.cur}</p>
                  <p>{el.level.cur}</p>
                </div>
              );
            })}
          </div>
        )}

        <div className="border-2 border-gray-400 bg-white h-fit flex rounded my-2 items-center">
          <img src={SearchImg} alt="search" className="w-8 h-8" />
          <select
            name="level"
            value={state.level}
            onChange={handleSearch}
            onFocus={() => setFocus(true)}
            onBlur={() => setTimeout(() => setFocus(false), 500)}
            className="min-w-12 sm:min-w-24 md:min-w-48 rounded px-4 h-8 focus:outline-none"
          >
            <option value="Select level" className="text-base">
              Select level
            </option>
            <option value="undergraduate" className="text-base">
              undergraduate
            </option>
            <option value="postgraduate" className="text-base">
              postgraduate
            </option>
            <option value="diploma" className="text-base">
              diploma
            </option>
          </select>
        </div>
      </div>
    </div>
  );
};

export default SearchBar;
